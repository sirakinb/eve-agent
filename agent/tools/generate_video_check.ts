import { Buffer } from "node:buffer";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { safeImageFilename } from "../lib/generate-image";
import { checkVideoClip, VIDEO_MODEL, VIDEO_OUTPUT_DIR } from "../lib/generate-video";

export default defineTool({
  description:
    "Check a video generation job started by generate_video. Pass back the exact operation_json it returned. While the job reports pending, sleep 60–120 seconds with the sleep tool and call this again. When completed, the mp4 is saved under sandbox generated/ and posted to iMessage automatically. Use google_drive_upload to put it in Drive.",
  inputSchema: z.object({
    operation_json: z
      .string()
      .min(2)
      .describe("The exact operation_json string returned by generate_video."),
    filename: z
      .string()
      .min(1)
      .optional()
      .describe("Optional stem for the saved file, e.g. product-hero."),
  }),
  async execute({ operation_json, filename }, ctx) {
    let operation: unknown;
    try {
      operation = JSON.parse(operation_json);
    } catch {
      return {
        ok: false,
        reason:
          "operation_json is not valid JSON. Pass it back exactly as returned by generate_video.",
      };
    }

    try {
      const status = await checkVideoClip(operation);

      if (status.status === "pending") {
        return {
          ok: true,
          status: "pending",
          next_step:
            "Still generating. Sleep 60–120 seconds with the sleep tool, then call generate_video_check again with the same operation_json.",
        };
      }

      if (status.status === "error") {
        return { ok: false, reason: String(status.error).slice(0, 400) };
      }

      const sandbox = await ctx.getSandbox();
      await sandbox.run({ command: `mkdir -p ${VIDEO_OUTPUT_DIR}` });

      const videos = [];
      for (const [index, video] of status.videos.entries()) {
        let bytes: Uint8Array;
        if (video.type === "url") {
          const response = await fetch(video.url);
          if (!response.ok) {
            return {
              ok: false,
              reason: `Video finished but the download failed: HTTP ${response.status}. Call generate_video_check again.`,
            };
          }
          bytes = new Uint8Array(await response.arrayBuffer());
        } else if (video.type === "base64") {
          bytes = Uint8Array.from(Buffer.from(video.data, "base64"));
        } else {
          bytes = video.data;
        }

        const stem =
          filename && status.videos.length === 1
            ? filename
            : filename
              ? `${filename}-${index + 1}`
              : `video-${index + 1}`;
        const savedName = safeImageFilename(stem, "mp4");
        const path = `${VIDEO_OUTPUT_DIR}/${savedName}`;
        await sandbox.writeBinaryFile({ path, content: bytes });
        videos.push({
          path,
          filename: savedName,
          mediaType: video.mediaType || "video/mp4",
          bytes: bytes.byteLength,
        });
      }

      return {
        ok: true,
        status: "completed",
        model: VIDEO_MODEL,
        count: videos.length,
        videos,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message.slice(0, 400) };
    }
  },
});
