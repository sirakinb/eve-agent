import { Buffer } from "node:buffer";

export const GENERATE_IMAGE_TOOL = "generate_image";
export const GENERATE_VIDEO_TOOL = "generate_video";
export const GENERATE_VIDEO_CHECK_TOOL = "generate_video_check";

export type GeneratedMediaRef = {
  path: string;
  filename: string;
  mediaType: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function mediaRefsFromArray(value: unknown): GeneratedMediaRef[] {
  if (!Array.isArray(value)) return [];
  const items: GeneratedMediaRef[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (
      typeof item.path !== "string" ||
      typeof item.filename !== "string" ||
      typeof item.mediaType !== "string"
    ) {
      continue;
    }
    items.push({
      path: item.path,
      filename: item.filename,
      mediaType: item.mediaType,
    });
  }
  return items;
}

export function generatedMediaFromToolOutput(
  output: unknown,
): GeneratedMediaRef[] | null {
  if (!isRecord(output) || output.ok !== true) return null;
  const items = [
    ...mediaRefsFromArray(output.images),
    ...mediaRefsFromArray(output.videos),
  ];
  return items.length > 0 ? items : null;
}

type SandboxBinaryReader = {
  readBinaryFile: (options: { path: string }) => Promise<Uint8Array | null>;
};

type ThreadWithFiles = {
  post: (message: {
    markdown: string;
    files: Array<{ data: Buffer; filename: string; mimeType: string }>;
  }) => Promise<unknown>;
};

export async function postGeneratedMediaToThread(
  thread: ThreadWithFiles,
  sandbox: SandboxBinaryReader,
  items: readonly GeneratedMediaRef[],
): Promise<number> {
  const files: Array<{ data: Buffer; filename: string; mimeType: string }> = [];

  for (const item of items) {
    const bytes = await sandbox.readBinaryFile({ path: item.path });
    if (!bytes || bytes.byteLength === 0) continue;
    files.push({
      data: Buffer.from(bytes),
      filename: item.filename,
      mimeType: item.mediaType,
    });
  }

  if (files.length === 0) return 0;

  const label =
    files.length === 1
      ? files[0].filename
      : `${files.length} files`;
  await thread.post({ markdown: label, files });
  return files.length;
}
