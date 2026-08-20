import { defineTool } from "eve/tools";
import { z } from "zod";
import { isGoogleConfigured, slidesReplaceAll } from "../lib/google-workspace";

export default defineTool({
  description:
    "Replace all matching text in a Google Slides deck. Confirm with Aki in chat first, then call — do not wait for Approve tool call.",
  inputSchema: z.object({
    presentationId: z.string().min(1),
    find: z.string().min(1),
    replace: z.string(),
  }),
  async execute({ presentationId, find, replace }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await slidesReplaceAll(presentationId, find, replace);
    return { ok: true, data };
  },
});
