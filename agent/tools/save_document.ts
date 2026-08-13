import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertDocument } from "../lib/company-documents";

export default defineTool({
  description:
    "Save or update a durable company document in InsForge (positioning, offer, content, outreach, ops). Use after decisions land. Clients never see GitHub — this is the long-form system of record.",
  inputSchema: z.object({
    slug: z
      .string()
      .min(1)
      .describe(
        "Stable path key, e.g. company/positioning, company/offer, content/calendar, ops/schedule.",
      ),
    title: z.string().min(1),
    body: z
      .string()
      .min(1)
      .describe("Full markdown body of the document."),
  }),
  async execute({ slug, title, body }, ctx) {
    const durable = await upsertDocument({ slug, title, body });

    if (durable.ok) {
      const sandbox = await ctx.getSandbox();
      const scratchPath =
        slug === "company/positioning" ||
        slug === "company/offer" ||
        slug === "company/proof" ||
        slug === "company/not-this"
          ? "COMPANY.md"
          : slug === "founder/working-style"
            ? "FOUNDER.md"
            : null;
      if (scratchPath) {
        await sandbox.writeTextFile({
          path: scratchPath,
          content: `${body.trim()}\n`,
        });
      }
    }

    return {
      slug,
      title,
      durable: durable.ok
        ? "saved"
        : durable.skipped
          ? "skipped"
          : `failed: ${durable.reason}`,
      updated_at: durable.ok ? durable.data.updated_at : undefined,
    };
  },
});
