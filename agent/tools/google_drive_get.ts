import { defineTool } from "eve/tools";
import { z } from "zod";
import { driveGet, isGoogleConfigured } from "../lib/google-workspace";

export default defineTool({
  description:
    "Get Google Drive file metadata by id (name, type, link). Use google_docs_get / google_sheets_get / google_slides_get for content.",
  inputSchema: z.object({
    fileId: z.string().min(1),
  }),
  async execute({ fileId }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await driveGet(fileId);
    return { ok: true, data };
  },
});
