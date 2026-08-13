import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDocument } from "../lib/company-documents";

export default defineTool({
  description:
    "Read one durable company document from InsForge by slug. Use when Aki asks to see positioning, offer, content calendar, etc. Reply with the markdown in chat (or email if asked).",
  inputSchema: z.object({
    slug: z
      .string()
      .min(1)
      .describe(
        "Stable path key, e.g. company/positioning, company/offer, content/calendar.",
      ),
  }),
  async execute({ slug }) {
    const result = await getDocument(slug);

    if (!result.ok) {
      return {
        slug,
        found: false,
        durable: result.skipped ? "skipped" : `failed: ${result.reason}`,
      };
    }

    if (!result.data) {
      return { slug, found: false, durable: "saved" };
    }

    return {
      slug: result.data.slug,
      title: result.data.title,
      body: result.data.body,
      updated_at: result.data.updated_at,
      found: true,
      durable: "saved",
    };
  },
});
