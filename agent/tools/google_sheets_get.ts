import { defineTool } from "eve/tools";
import { z } from "zod";
import { isGoogleConfigured, sheetsGet } from "../lib/google-workspace";

export default defineTool({
  description:
    "Read a Google Sheet. Omit range for tab names; pass a range like Sheet1!A1:D20 for cell values.",
  inputSchema: z.object({
    spreadsheetId: z.string().min(1),
    range: z.string().optional(),
  }),
  async execute({ spreadsheetId, range }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await sheetsGet(spreadsheetId, range);
    return { ok: true, data };
  },
});
