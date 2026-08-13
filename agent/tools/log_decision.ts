import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertDecision } from "../lib/company-memory";
import { workingMemory } from "../lib/working-memory";

export default defineTool({
  description:
    "Record a decision Aki or Adzo made. Writes this session and the InsForge company store so it survives new conversations.",
  inputSchema: z.object({
    id: z
      .string()
      .min(1)
      .describe("Short stable id, such as 'head-agent-stack'."),
    decision: z.string().min(1),
    rationale: z.string().min(1),
  }),
  async execute({ id, decision, rationale }, ctx) {
    const decidedAt = new Date().toISOString();

    workingMemory.update((memory) => {
      const entry = { id, decision, rationale, decidedAt };
      const exists = memory.decisions.some((item) => item.id === id);
      return {
        ...memory,
        decisions: exists
          ? memory.decisions.map((item) => (item.id === id ? entry : item))
          : [...memory.decisions, entry],
      };
    });

    const sandbox = await ctx.getSandbox();
    const path = "life/areas/pentridge/decisions.md";
    const existing = await sandbox.readTextFile({ path });
    await sandbox.writeTextFile({
      path,
      content: `${existing ?? "# Decisions\n\n"}- ${decidedAt.slice(0, 10)} — ${decision} (${rationale})\n`,
    });

    const durable = await upsertDecision({
      id,
      decision,
      rationale,
      decidedAt,
    });

    return {
      ...workingMemory.get().decisions.find((item) => item.id === id),
      durable: durable.ok
        ? "saved"
        : durable.skipped
          ? "skipped"
          : `failed: ${durable.reason}`,
    };
  },
});
