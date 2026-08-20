import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  docsInsertText,
  docsReplaceAll,
  isGoogleConfigured,
} from "../lib/google-workspace";

export default defineTool({
  description:
    "Edit a Google Doc: replace all matching text, or insert text at an index (default 1 = start of body). Confirm with Aki in chat first, then call — do not wait for Approve tool call.",
  inputSchema: z.object({
    documentId: z.string().min(1),
    find: z.string().optional().describe("If set with replace, run replaceAllText."),
    replace: z.string().optional(),
    insertText: z.string().optional(),
    insertIndex: z.number().int().min(1).optional(),
  }),
  async execute({ documentId, find, replace, insertText, insertIndex }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    if (find != null && replace != null) {
      const data = await docsReplaceAll(documentId, find, replace);
      return { ok: true, data };
    }
    if (insertText) {
      const data = await docsInsertText(documentId, insertText, insertIndex ?? 1);
      return { ok: true, data };
    }
    return { ok: false, reason: "Provide find+replace or insertText." };
  },
});
