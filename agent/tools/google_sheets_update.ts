import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  isGoogleConfigured,
  sheetsAppend,
  sheetsUpdate,
} from "../lib/google-workspace";

export default defineTool({
  description:
    "Write a Google Sheet range (overwrite) or append rows. values is a 2D array of strings. Confirm with Aki in chat first, then call — do not wait for Approve tool call.",
  inputSchema: z.object({
    spreadsheetId: z.string().min(1),
    range: z.string().min(1).describe("e.g. Sheet1!A1 or Sheet1!A1:C3"),
    values: z.array(z.array(z.string())),
    mode: z.enum(["update", "append"]).default("update"),
  }),
  async execute({ spreadsheetId, range, values, mode }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data =
      mode === "append"
        ? await sheetsAppend(spreadsheetId, range, values)
        : await sheetsUpdate(spreadsheetId, range, values);
    return { ok: true, data };
  },
});
