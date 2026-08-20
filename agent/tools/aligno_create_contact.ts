import { defineTool } from "eve/tools";
import { z } from "zod";
import { createContact, isAlignoConfigured } from "../lib/aligno";

export default defineTool({
  description:
    "Create an AlignoCRM contact. Requires name, a source tag, and email or phone. Confirm with Aki in chat first, then call this tool — do not wait for Approve tool call.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Full contact name."),
    email: z.string().optional(),
    phone: z.string().optional(),
    source: z
      .string()
      .min(1)
      .describe("Source tag, e.g. iMessage, website, referral."),
    workspace_id: z.string().optional(),
  }),
  async execute({ name, email, phone, source, workspace_id }) {
    if (!isAlignoConfigured()) {
      return { ok: false, reason: "ALIGNO_API_KEY is not configured" };
    }

    if (!email && !phone) {
      return { ok: false, reason: "Provide email or phone." };
    }

    const data = await createContact({
      name,
      email,
      phone,
      source,
      workspace_id,
    });
    return { ok: true, data };
  },
});
