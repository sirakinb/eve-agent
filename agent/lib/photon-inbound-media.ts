import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { imessageAdapterFromThread } from "./photon-voice";

// Photon webhooks deliver photo/video attachments as metadata only, exactly
// like voice memos. The bytes are re-fetched through the vendored iMessage
// adapter's resolveMessage() (see photon-voice.ts for the full story). Images
// become model-visible data: URLs on the message attachments; videos get a few
// extracted frames instead, since the model cannot ingest video. Saving bytes
// into the session sandbox happens later, from the imessage_save_attachment
// tool, because onMessage has no sandbox access.

const MAX_READ_BYTES = 120 * 1024 * 1024;
const MODEL_IMAGE_DIRECT_BYTES = 3_500_000;
const MAX_MODEL_IMAGES = 6;
const MAX_VIDEO_FRAMES = 4;
const FRAME_INTERVAL_SECONDS = 3;

export type InboundAttachment = {
  url?: string;
  name?: string;
  mimeType?: string;
  type?: string;
};

export type MediaMessage = {
  id?: string;
  text?: string;
  attachments?: InboundAttachment[];
  raw?: unknown;
};

type SandboxWriter = {
  run(input: { command: string }): PromiseLike<unknown>;
  writeBinaryFile(input: { path: string; content: Uint8Array }): PromiseLike<unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// ---------------------------------------------------------------------------
// Thread registry: tools cannot reach the channel, so the channel registers
// live Thread objects (which expose the adapter) as messages and events flow
// through. Same-process only; a recycled instance simply loses the entry and
// the save tool reports that the attachment must be re-sent.
// ---------------------------------------------------------------------------

const liveThreads = new Map<string, unknown>();

function threadIdOf(thread: unknown): string | undefined {
  return isRecord(thread) && typeof thread.id === "string" ? thread.id : undefined;
}

export function registerPhotonThread(thread: unknown): void {
  const id = threadIdOf(thread);
  if (id && imessageAdapterFromThread(thread)) liveThreads.set(id, thread);
}

export function photonThread(threadId: string): unknown {
  return liveThreads.get(threadId);
}

// ---------------------------------------------------------------------------
// Attachment part collection (generic flavor of the voice-note collector)
// ---------------------------------------------------------------------------

type ReadablePart = {
  mimeType?: string;
  name?: string;
  read: () => Promise<Buffer>;
};

function collectReadableParts(content: unknown): ReadablePart[] {
  if (!isRecord(content) || typeof content.type !== "string") return [];
  if (typeof content.read === "function") {
    return [
      {
        mimeType: typeof content.mimeType === "string" ? content.mimeType : undefined,
        name: typeof content.name === "string" ? content.name : undefined,
        read: content.read as () => Promise<Buffer>,
      },
    ];
  }
  if (content.type === "reply") return collectReadableParts(content.content);
  if (content.type === "group" && Array.isArray(content.items)) {
    return content.items.flatMap((item) =>
      collectReadableParts(isRecord(item) ? item.content : undefined),
    );
  }
  return [];
}

const AUDIO_NAME_RE = /\.(caf|m4a|aac|amr|wav|mp3|opus|ogg)$/i;

function isAudioAttachment(att: { mimeType?: string; name?: string; type?: string }): boolean {
  if (att.type === "audio" || att.type === "voice") return true;
  if (typeof att.mimeType === "string" && att.mimeType.toLowerCase().startsWith("audio/")) return true;
  return AUDIO_NAME_RE.test(att.name ?? "");
}

function rawContentHintsMedia(content: unknown): boolean {
  if (!isRecord(content) || typeof content.type !== "string") return false;
  if (content.type === "image" || content.type === "video" || content.type === "file") return true;
  if (content.type === "attachment") {
    return !isAudioAttachment({
      mimeType: typeof content.mimeType === "string" ? content.mimeType : undefined,
      name: typeof content.name === "string" ? content.name : undefined,
    });
  }
  if (content.type === "reply") return rawContentHintsMedia(content.content);
  if (content.type === "group" && Array.isArray(content.items)) {
    return content.items.some((item) =>
      rawContentHintsMedia(isRecord(item) ? item.content : undefined),
    );
  }
  return false;
}

export function looksLikeMediaMessage(message: MediaMessage): boolean {
  if ((message.attachments ?? []).some((att) => !isAudioAttachment(att))) return true;
  return isRecord(message.raw) ? rawContentHintsMedia(message.raw.content) : false;
}

// ---------------------------------------------------------------------------
// Byte sniffing — Photon mimes are unreliable (voice memos arrive as
// application/octet-stream), so trust magic bytes over metadata.
// ---------------------------------------------------------------------------

type Sniffed =
  | { kind: "image"; ext: string; mediaType: string; modelReady: boolean }
  | { kind: "video"; ext: string; mediaType: string }
  | { kind: "audio"; ext: string; mediaType: string }
  | { kind: "unknown"; ext: string; mediaType: string };

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heif"]);

export function sniffBytes(bytes: Uint8Array): Sniffed {
  const ascii = (offset: number, length: number) =>
    String.fromCharCode(...bytes.subarray(offset, offset + length));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { kind: "image", ext: "jpg", mediaType: "image/jpeg", modelReady: true };
  }
  if (bytes.length >= 4 && bytes[0] === 0x89 && ascii(1, 3) === "PNG") {
    return { kind: "image", ext: "png", mediaType: "image/png", modelReady: true };
  }
  if (bytes.length >= 4 && ascii(0, 4) === "GIF8") {
    return { kind: "image", ext: "gif", mediaType: "image/gif", modelReady: true };
  }
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    return { kind: "image", ext: "webp", mediaType: "image/webp", modelReady: true };
  }
  if (bytes.length >= 12 && ascii(4, 4) === "ftyp") {
    const brand = ascii(8, 4).trim().toLowerCase();
    if (HEIC_BRANDS.has(brand)) {
      return { kind: "image", ext: "heic", mediaType: "image/heic", modelReady: false };
    }
    if (brand === "m4a") return { kind: "audio", ext: "m4a", mediaType: "audio/mp4" };
    if (brand === "qt") return { kind: "video", ext: "mov", mediaType: "video/quicktime" };
    return { kind: "video", ext: "mp4", mediaType: "video/mp4" };
  }
  if (bytes.length >= 4 && ascii(0, 4) === "caff") {
    return { kind: "audio", ext: "caf", mediaType: "audio/x-caf" };
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return { kind: "video", ext: "webm", mediaType: "video/webm" };
  }
  return { kind: "unknown", ext: "bin", mediaType: "application/octet-stream" };
}

// ---------------------------------------------------------------------------
// ffmpeg helpers (ffmpeg-static is already vendored for voice notes)
// ---------------------------------------------------------------------------

async function runFfmpeg(args: string[]): Promise<void> {
  const binary = ffmpegPath;
  if (!binary) throw new Error("ffmpeg binary unavailable");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(binary, ["-hide_banner", "-loglevel", "error", ...args]);
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(0, 300)}`));
    });
  });
}

const SCALE_1568 = "scale='min(iw,1568)':'min(ih,1568)':force_original_aspect_ratio=decrease";
const SCALE_1024 = "scale='min(iw,1024)':'min(ih,1024)':force_original_aspect_ratio=decrease";

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "photon-media-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Re-encode any decodable image to a model-friendly, size-capped JPEG. */
export async function toModelJpeg(bytes: Uint8Array, ext: string): Promise<Buffer | null> {
  try {
    return await withTempDir(async (dir) => {
      const input = join(dir, `input.${ext}`);
      const output = join(dir, "output.jpg");
      await writeFile(input, bytes);
      await runFfmpeg(["-i", input, "-vf", SCALE_1568, "-frames:v", "1", "-q:v", "3", output]);
      return readFile(output);
    });
  } catch (error) {
    console.error("Image conversion failed", { ext, bytes: bytes.byteLength, error });
    return null;
  }
}

/** Sample up to MAX_VIDEO_FRAMES stills, one every FRAME_INTERVAL_SECONDS. */
export async function extractVideoFrames(bytes: Uint8Array, ext: string): Promise<Buffer[]> {
  try {
    return await withTempDir(async (dir) => {
      const input = join(dir, `input.${ext}`);
      await writeFile(input, bytes);
      await runFfmpeg([
        "-i",
        input,
        "-vf",
        `fps=1/${FRAME_INTERVAL_SECONDS},${SCALE_1024}`,
        "-frames:v",
        String(MAX_VIDEO_FRAMES),
        "-q:v",
        "4",
        join(dir, "frame-%d.jpg"),
      ]);
      const names = (await readdir(dir))
        .filter((name) => name.startsWith("frame-"))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const frames: Buffer[] = [];
      for (const name of names) frames.push(await readFile(join(dir, name)));
      return frames;
    });
  } catch (error) {
    console.error("Video frame extraction failed", { ext, bytes: bytes.byteLength, error });
    return [];
  }
}

function dataUrl(mediaType: string, bytes: Uint8Array): string {
  return `data:${mediaType};base64,${Buffer.from(bytes).toString("base64")}`;
}

function mb(byteLength: number): string {
  return `${(byteLength / (1024 * 1024)).toFixed(1)}MB`;
}

// ---------------------------------------------------------------------------
// Inbound hydration
// ---------------------------------------------------------------------------

export type InboundMediaHydration = {
  context: string[];
};

export async function hydrateInboundMedia(
  message: MediaMessage,
  thread: unknown,
): Promise<InboundMediaHydration | null> {
  if (!looksLikeMediaMessage(message)) return null;

  const id =
    typeof message.id === "string" && message.id.length > 0
      ? message.id
      : isRecord(message.raw) && typeof message.raw.id === "string"
        ? message.raw.id
        : undefined;
  const chat = threadIdOf(thread);
  const adapter = imessageAdapterFromThread(thread);

  if (!id || !chat || !adapter) {
    console.error("Inbound media is missing what resolveMessage needs", {
      messageId: id,
      threadId: chat,
      adapterFound: Boolean(adapter),
    });
    return null;
  }

  registerPhotonThread(thread);

  try {
    let parts = collectReadableParts(isRecord(message.raw) ? message.raw.content : undefined);
    if (parts.length === 0) {
      const fetched = await adapter.resolveMessage(chat, id);
      parts = collectReadableParts(fetched?.content);
    }
    const mediaParts = parts.filter(
      (part) => !isAudioAttachment({ mimeType: part.mimeType, name: part.name }),
    );

    console.log("Hydrating inbound iMessage media", {
      messageId: id,
      threadId: chat,
      parts: mediaParts.map((part) => ({ mimeType: part.mimeType, name: part.name })),
    });

    if (mediaParts.length === 0) return null;

    const hydrated: InboundAttachment[] = (message.attachments ?? []).filter(
      (att) => att.url || isAudioAttachment(att),
    );
    const itemNotes: string[] = [];
    let visibleImages = 0;

    for (const [index, part] of mediaParts.entries()) {
      const bytes = await part.read();
      if (bytes.byteLength === 0 || bytes.byteLength > MAX_READ_BYTES) {
        itemNotes.push(
          `${part.name ?? `attachment ${index + 1}`}: ${
            bytes.byteLength === 0 ? "empty" : `too large to process (${mb(bytes.byteLength)})`
          }`,
        );
        continue;
      }
      const sniffed = sniffBytes(bytes);
      const label = part.name ?? `attachment-${index + 1}.${sniffed.ext}`;

      if (sniffed.kind === "audio") continue; // voice pipeline owns audio

      if (sniffed.kind === "image") {
        let visible: { mediaType: string; bytes: Uint8Array } | null = null;
        if (sniffed.modelReady && bytes.byteLength <= MODEL_IMAGE_DIRECT_BYTES) {
          visible = { mediaType: sniffed.mediaType, bytes };
        } else {
          const converted = await toModelJpeg(bytes, sniffed.ext);
          if (converted) visible = { mediaType: "image/jpeg", bytes: converted };
        }
        if (visible && visibleImages < MAX_MODEL_IMAGES) {
          visibleImages += 1;
          hydrated.push({
            name: label,
            mimeType: visible.mediaType,
            type: "image",
            url: dataUrl(visible.mediaType, visible.bytes),
          });
          itemNotes.push(`${label} (${sniffed.mediaType}, ${mb(bytes.byteLength)}): shown to you inline`);
        } else {
          itemNotes.push(
            `${label} (${sniffed.mediaType}, ${mb(bytes.byteLength)}): could not be decoded for viewing, but can still be saved and uploaded`,
          );
        }
        continue;
      }

      if (sniffed.kind === "video") {
        const frames = await extractVideoFrames(bytes, sniffed.ext);
        for (const [frameIndex, frame] of frames.entries()) {
          if (visibleImages >= MAX_MODEL_IMAGES) break;
          visibleImages += 1;
          hydrated.push({
            name: `${label}-frame-${frameIndex + 1}.jpg`,
            mimeType: "image/jpeg",
            type: "image",
            url: dataUrl("image/jpeg", frame),
          });
        }
        const stamps = frames
          .map((_, frameIndex) => `${frameIndex * FRAME_INTERVAL_SECONDS}s`)
          .join("/");
        itemNotes.push(
          frames.length > 0
            ? `${label} (${sniffed.mediaType}, ${mb(bytes.byteLength)}): video — ${frames.length} sampled frames at ~${stamps} shown to you inline; you cannot watch the full video`
            : `${label} (${sniffed.mediaType}, ${mb(bytes.byteLength)}): video — frame sampling failed, so you cannot view it, but it can still be saved and uploaded`,
        );
        continue;
      }

      itemNotes.push(
        `${label} (${mb(bytes.byteLength)}): unrecognized format; it can still be saved and uploaded`,
      );
    }

    if (itemNotes.length === 0) return null;

    message.attachments = hydrated;
    if (!message.text?.trim()) {
      message.text = `[Attachment] Aki sent ${itemNotes.length} media file(s) with no caption.`;
    }

    return {
      context: [
        `Aki attached media to this iMessage (thread_id=${chat}, message_id=${id}). ` +
          `Items: ${itemNotes.join("; ")}. ` +
          `Inline images are for viewing only — to use the original files with tools ` +
          `(google_drive_upload, generate_image source_paths, generate_video), first call ` +
          `imessage_save_attachment with this thread_id and message_id; it saves the originals under incoming/ in the sandbox.`,
      ],
    };
  } catch (error) {
    console.error("Failed to hydrate inbound iMessage media", error, {
      messageId: id,
      threadId: chat,
    });
    return {
      context: [
        `Aki attached media to this iMessage (thread_id=${chat}, message_id=${id}), but fetching it failed. ` +
          `You can retry via imessage_save_attachment, or ask Aki to resend.`,
      ],
    };
  }
}

// ---------------------------------------------------------------------------
// Save originals into the sandbox (called from the imessage_save_attachment tool)
// ---------------------------------------------------------------------------

export const INCOMING_DIR = "incoming";

function safeStem(stem: string): string {
  const cleaned = stem
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "attachment";
}

export type SavedAttachment = {
  path: string;
  filename: string;
  mediaType: string;
  kind: string;
  bytes: number;
};

export async function saveInboundAttachments(input: {
  threadId: string;
  messageId: string;
  sandbox: SandboxWriter;
  stem?: string;
}): Promise<SavedAttachment[]> {
  const thread = photonThread(input.threadId);
  const adapter = imessageAdapterFromThread(thread);
  if (!adapter) {
    throw new Error(
      `No live iMessage connection for thread ${input.threadId}. Ask Aki to send a new message (or resend the attachment) and try again.`,
    );
  }

  const fetched = await adapter.resolveMessage(input.threadId, input.messageId);
  const parts = collectReadableParts(fetched?.content);
  if (parts.length === 0) {
    throw new Error("The message has no fetchable attachments.");
  }

  await input.sandbox.run({ command: `mkdir -p ${INCOMING_DIR}` });

  const saved: SavedAttachment[] = [];
  for (const [index, part] of parts.entries()) {
    const bytes = await part.read();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_READ_BYTES) continue;
    const sniffed = sniffBytes(bytes);
    const base = safeStem(input.stem ?? part.name ?? input.messageId.slice(-12));
    const suffix = parts.length > 1 ? `-${index + 1}` : "";
    const filename = `${base}${suffix}.${sniffed.ext}`;
    const path = `${INCOMING_DIR}/${filename}`;
    await input.sandbox.writeBinaryFile({ path, content: bytes });
    saved.push({
      path,
      filename,
      mediaType: sniffed.mediaType,
      kind: sniffed.kind,
      bytes: bytes.byteLength,
    });
  }

  if (saved.length === 0) {
    throw new Error("All attachments were empty or too large to save.");
  }
  return saved;
}
