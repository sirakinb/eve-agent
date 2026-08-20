import { defineTool } from "eve/tools";
import { z } from "zod";
import { exportContacts, isAlignoConfigured } from "../lib/aligno";

export default defineTool({
  description:
    "List AlignoCRM contacts visible to this workspace. Use when Aki asks who is in the CRM, to look up a person, or before creating a duplicate contact.",
  inputSchema: z.object({
    unused: z
      .boolean()
      .optional()
      .describe("Ignored. Reserved for schema compatibility."),
  }),
  async execute() {
    if (!isAlignoConfigured()) {
      return { ok: false, reason: "ALIGNO_API_KEY is not configured" };
    }

    const data = await exportContacts();
    return { ok: true, data };
  },
});
