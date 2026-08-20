import { defineTool } from "eve/tools";
import { z } from "zod";
import { createLead, isAlignoConfigured } from "../lib/aligno";

export default defineTool({
  description:
    "Create an AlignoCRM contact and pipeline lead in one call. Confirm with Aki in chat first, then call this tool — do not wait for Approve tool call.",
  inputSchema: z.object({
    name: z.string().optional().describe("Full name, or use first_name/last_name."),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
    details: z.string().optional().describe("Free-text notes for the contact."),
    pipeline_id: z.string().optional(),
    pipeline_name: z.string().optional(),
    stage_id: z.string().optional(),
    stage_name: z.string().optional(),
  }),
  async execute(input) {
    if (!isAlignoConfigured()) {
      return { ok: false, reason: "ALIGNO_API_KEY is not configured" };
    }

    if (!input.name && !input.first_name) {
      return { ok: false, reason: "Provide name or first_name." };
    }

    if (!input.email && !input.phone) {
      return { ok: false, reason: "Provide email or phone." };
    }

    const data = await createLead(input);
    return { ok: true, data };
  },
});
