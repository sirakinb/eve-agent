import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveInboundAttachments } from "../lib/photon-inbound-media";

export default defineTool({
  description:
    "Save the original photo/video/file attachments from an iMessage Aki sent into the sandbox under incoming/. The thread_id and message_id come from the attachment context note on the message. Use the returned paths with google_drive_upload or generate_image source_paths. Runs immediately — no approval needed.",
  inputSchema: z.object({
    thread_id: z
      .string()
      .min(1)
      .describe("The thread_id from the attachment context note."),
    message_id: z
      .string()
      .min(1)
      .describe("The message_id from the attachment context note."),
    filename: z
      .string()
      .min(1)
      .optional()
      .describe("Optional stem for the saved file(s), e.g. funnel-hero-photo."),
  }),
  async execute({ thread_id, message_id, filename }, ctx) {
    try {
      const sandbox = await ctx.getSandbox();
      const files = await saveInboundAttachments({
        threadId: thread_id,
        messageId: message_id,
        sandbox,
        stem: filename,
      });
      return { ok: true, count: files.length, files };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message.slice(0, 400) };
    }
  },
});
