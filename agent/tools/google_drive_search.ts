import { defineTool } from "eve/tools";
import { z } from "zod";
import { driveSearch, isGoogleConfigured } from "../lib/google-workspace";

export default defineTool({
  description:
    "Search Google Drive as adzo@pentridgemedia.com. Use Drive query syntax, e.g. name contains 'brief' and mimeType = 'application/vnd.google-apps.document'. Lists files Adzo can access, including shared folders.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Drive search query. Example: mimeType = 'application/vnd.google-apps.folder'"),
    pageSize: z.number().int().min(1).max(100).optional(),
  }),
  async execute({ query, pageSize }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await driveSearch(query, pageSize ?? 25);
    return { ok: true, data };
  },
});
