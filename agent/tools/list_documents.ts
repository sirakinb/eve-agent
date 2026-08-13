import { defineTool } from "eve/tools";
import { z } from "zod";
import { listDocuments } from "../lib/company-documents";

export default defineTool({
  description:
    "List durable company documents in InsForge (slug, title, updated_at). Use before choosing which doc to read or update.",
  inputSchema: z.object({
    unused: z.boolean().optional().describe("Ignored. Reserved for schema compatibility."),
  }),
  async execute() {
    const result = await listDocuments();

    if (!result.ok) {
      return {
        documents: [],
        durable: result.skipped ? "skipped" : `failed: ${result.reason}`,
      };
    }

    return {
      documents: result.data,
      durable: "saved",
    };
  },
});
