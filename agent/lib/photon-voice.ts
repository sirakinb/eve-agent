import { transcribe, gateway } from "ai";
import { ensureM4a } from "spectrum-ts/authoring";

const VOICE_PREFIX = "[Voice note]";
const WHISPER_MAX_BYTES = 25 * 1024 * 1024;
const FAILED_TRANSCRIPT = `${VOICE_PREFIX} received, but transcription failed.`;

export type TranscribableMessage = {
  id?: string;
  text?: string;
  attachments?: Array<{ mimeType?: string; name?: string; type?: string }>;
  raw?: unknown;
};

export type VoiceHydration = {
  transcribed: boolean;
  context: string;
};

// Photon webhooks deliver voice memos as metadata only (no attachment id, no
// bytes). The eve iMessage adapter's own Spectrum runtime — with gRPC vendored
// into eve's compiled bundle — is the only thing in the deployed function that
// can fetch the audio. Reach it through the adapter's public resolveMessage()
// rather than Spectrum internals, which differ between the npm and vendored
// builds.
type AdapterRecord = { id?: string; content?: unknown };

type IMessageAdapter = {
  name: string;
  resolveMessage: (threadId: string, messageId: string) => Promise<AdapterRecord | undefined>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function imessageAdapterFromThread(thread: unknown): IMessageAdapter | undefined {
  if (!isRecord(thread)) return undefined;
  let adapter: unknown;
  try {
    adapter = (thread as { adapter?: unknown }).adapter;
  } catch {
    return undefined;
  }
  if (
    isRecord(adapter) &&
    adapter.name === "imessage" &&
    typeof adapter.resolveMessage === "function"
  ) {
    return adapter as IMessageAdapter;
  }
  return undefined;
}

function threadId(thread: unknown): string | undefined {
  return isRecord(thread) && typeof thread.id === "string" ? thread.id : undefined;
}

function isAudioMime(mimeType: string | undefined): boolean {
  return typeof mimeType === "string" && mimeType.toLowerCase().startsWith("audio/");
}

function looksLikeVoiceNote(message: TranscribableMessage): boolean {
  if ((message.attachments ?? []).some((attachment) => attachment.type === "audio" || isAudioMime(attachment.mimeType))) {
    return true;
  }
  if (!isRecord(message.raw) || !isRecord(message.raw.content)) return false;
  const type = message.raw.content.type;
  return type === "voice" || (type === "attachment" && isAudioMime(typeof message.raw.content.mimeType === "string" ? message.raw.content.mimeType : undefined));
}

function messageId(message: TranscribableMessage): string | undefined {
  if (typeof message.id === "string" && message.id.length > 0) return message.id;
  return isRecord(message.raw) && typeof message.raw.id === "string" ? message.raw.id : undefined;
}

type ReadableAudio = {
  mimeType: string;
  name?: string;
  read: () => Promise<Buffer>;
};

const AUDIO_NAME_RE = /\.(caf|m4a|mp4|aac|amr|wav|mp3|opus|ogg)$/i;

// Photon's getAttachmentInfo often reports voice memos with a generic mime
// (application/octet-stream), so collect every readable attachment and let
// the caller prefer audio-looking parts. This only runs for messages the
// webhook already identified as voice notes.
function collectReadableParts(content: unknown): ReadableAudio[] {
  if (!isRecord(content) || typeof content.type !== "string") return [];
  if ((content.type === "voice" || content.type === "attachment") && typeof content.read === "function") {
    return [
      {
        mimeType: typeof content.mimeType === "string" && content.mimeType.length > 0 ? content.mimeType : "audio/x-caf",
        name: typeof content.name === "string" ? content.name : undefined,
        read: content.read as () => Promise<Buffer>,
      },
    ];
  }
  if (content.type === "reply") return collectReadableParts(content.content);
  if (content.type === "group" && Array.isArray(content.items)) {
    return content.items.flatMap((item) => collectReadableParts(isRecord(item) ? item.content : undefined));
  }
  return [];
}

function looksLikeAudioPart(part: ReadableAudio): boolean {
  return isAudioMime(part.mimeType) || AUDIO_NAME_RE.test(part.name ?? "");
}

function collectReadableAudio(content: unknown): ReadableAudio[] {
  const parts = collectReadableParts(content);
  const audio = parts.filter(looksLikeAudioPart);
  return audio.length > 0 ? audio : parts;
}

async function transcribeAudio(bytes: Uint8Array, mimeType: string): Promise<string> {
  let audio: Uint8Array = bytes;
  try {
    const converted = await ensureM4a(Buffer.from(bytes), mimeType);
    audio = converted.buffer;
  } catch (error) {
    console.error("CAF/m4a conversion failed; sending original bytes to Whisper", {
      mimeType,
      bytes: bytes.byteLength,
      error,
    });
  }
  const { text } = await transcribe({
    model: gateway.transcriptionModel("openai/whisper-1"),
    audio,
  });
  return text.trim();
}

function writeText(message: TranscribableMessage, text: string): void {
  message.text = text;
}

function mergeTranscript(existing: string | undefined, transcript: string): string {
  const body = `${VOICE_PREFIX} ${transcript}`;
  const prior = existing?.trim();
  return prior ? `${prior}\n\n${body}` : body;
}

function describeContent(content: unknown): unknown {
  if (!isRecord(content)) return content;
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(content)) {
    if (typeof value === "function") summary[key] = "[function]";
    else if (Array.isArray(value)) summary[key] = value.map((item) => describeContent(item));
    else if (isRecord(value)) summary[key] = describeContent(value);
    else summary[key] = value;
  }
  return summary;
}

function fail(message: TranscribableMessage): VoiceHydration {
  if (!message.text?.trim()) writeText(message, FAILED_TRANSCRIPT);
  return {
    transcribed: false,
    context: "Aki sent an iMessage voice note, but Whisper could not transcribe it.",
  };
}

export async function hydrateVoiceNote(
  message: TranscribableMessage,
  thread: unknown,
): Promise<VoiceHydration | null> {
  if (!looksLikeVoiceNote(message)) return null;

  const id = messageId(message);
  const chat = threadId(thread);
  const adapter = imessageAdapterFromThread(thread);

  if (!id || !chat || !adapter) {
    console.error("Voice note is missing what resolveMessage needs", {
      messageId: id,
      threadId: chat,
      adapterFound: Boolean(adapter),
      threadKeys: isRecord(thread) ? Object.keys(thread) : [],
    });
    return fail(message);
  }

  try {
    // The webhook payload never carries bytes; re-fetch the message through
    // the adapter so audio content arrives with a gRPC-backed read().
    const audio = collectReadableAudio(message.raw && isRecord(message.raw) ? message.raw.content : undefined);
    let fetched: AdapterRecord | undefined;
    if (audio.length === 0) {
      fetched = await adapter.resolveMessage(chat, id);
      audio.push(...collectReadableAudio(fetched?.content));
    }

    console.log("Hydrating iMessage voice note", {
      messageId: id,
      threadId: chat,
      fetchedId: fetched?.id,
      contentType: isRecord(fetched?.content) ? fetched.content.type : undefined,
      audioParts: audio.length,
      parts: audio.map((part) => ({ mimeType: part.mimeType, name: part.name })),
    });

    if (audio.length === 0) {
      console.error("Voice note fetch returned no readable attachment", {
        messageId: id,
        content: describeContent(fetched?.content),
      });
      return fail(message);
    }

    const transcripts: string[] = [];
    for (const part of audio) {
      const bytes = await part.read();
      if (bytes.byteLength === 0 || bytes.byteLength > WHISPER_MAX_BYTES) continue;
      const text = await transcribeAudio(bytes, part.mimeType);
      if (text) transcripts.push(text);
    }

    if (transcripts.length === 0) return fail(message);

    writeText(message, mergeTranscript(message.text, transcripts.join("\n\n")));
    return {
      transcribed: true,
      context: "Aki sent an iMessage voice note. The text is a Whisper transcript via AI Gateway.",
    };
  } catch (error) {
    console.error("Failed to transcribe iMessage voice note", error, {
      messageId: id,
      threadId: chat,
    });
    return fail(message);
  }
}
