import { defineTool } from "eve/tools";
import { z } from "zod";
import { driveUploadFile, isGoogleConfigured } from "../lib/google-workspace";

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  pdf: "application/pdf",
};

export default defineTool({
  description:
    "Upload a binary file from the sandbox (e.g. a generated/ image or video) to Google Drive as adzo@pentridgemedia.com. Use this to place generated JPGs and MP4s into Drive folders Aki shared. Confirm with Aki in chat first, then call — do not wait for Approve tool call.",
  inputSchema: z.object({
    path: z
      .string()
      .min(1)
      .describe("Sandbox path of the file to upload, e.g. generated/carousel-01.jpg."),
    parentId: z
      .string()
      .optional()
      .describe("Drive folder id to upload into. Omit for Adzo's My Drive root."),
    name: z
      .string()
      .min(1)
      .optional()
      .describe("Filename in Drive. Defaults to the sandbox filename."),
  }),
  async execute({ path, parentId, name }, ctx) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }

    const sandbox = await ctx.getSandbox();
    const bytes = await sandbox.readBinaryFile({ path });
    if (!bytes || bytes.byteLength === 0) {
      return { ok: false, reason: `Could not read file at ${path}` };
    }

    const filename = name ?? path.split("/").pop() ?? path;
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";

    try {
      const data = await driveUploadFile({
        name: filename,
        mimeType,
        content: bytes,
        parentId,
      });
      return { ok: true, bytes: bytes.byteLength, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message.slice(0, 400) };
    }
  },
});
