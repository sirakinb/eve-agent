import { defineTool } from "eve/tools";
import { z } from "zod";
import { docsGet, isGoogleConfigured } from "../lib/google-workspace";

export default defineTool({
  description: "Read a Google Doc body and title by document id.",
  inputSchema: z.object({
    documentId: z.string().min(1),
  }),
  async execute({ documentId }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await docsGet(documentId);
    return { ok: true, data };
  },
});
