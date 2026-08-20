import { defineTool } from "eve/tools";
import { z } from "zod";
import { isGoogleConfigured, slidesGet } from "../lib/google-workspace";

export default defineTool({
  description: "Read a Google Slides presentation (slides, text elements) by id.",
  inputSchema: z.object({
    presentationId: z.string().min(1),
  }),
  async execute({ presentationId }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await slidesGet(presentationId);
    return { ok: true, data };
  },
});
