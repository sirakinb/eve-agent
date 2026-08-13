import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertMemory } from "../lib/company-memory";
import { workingMemory } from "../lib/working-memory";

export default defineTool({
  description:
    "Persist a fact, preference, current focus, or open loop. Writes this session's working memory and the InsForge company store so it survives new conversations.",
  inputSchema: z.object({
    kind: z.enum(["fact", "preference", "focus", "loop"]),
    key: z
      .string()
      .min(1)
      .describe("Short stable key, such as 'timezone' or 'current-app'."),
    value: z.string().min(1),
    owner: z.enum(["aki", "pentridge", "agent"]).optional(),
  }),
  async execute({ kind, key, value, owner }, ctx) {
    workingMemory.update((memory) => {
      if (kind === "focus") {
        return { ...memory, currentFocus: value };
      }

      if (kind === "preference") {
        return {
          ...memory,
          preferences: { ...memory.preferences, [key]: value },
        };
      }

      if (kind === "loop") {
        const existing = memory.openLoops.find((loop) => loop.id === key);
        const nextLoop = {
          id: key,
          item: value,
          owner: owner ?? "aki",
          status: "open" as const,
        };
        return {
          ...memory,
          openLoops: existing
            ? memory.openLoops.map((loop) =>
                loop.id === key ? { ...loop, ...nextLoop } : loop,
              )
            : [...memory.openLoops, nextLoop],
        };
      }

      return { ...memory, facts: { ...memory.facts, [key]: value } };
    });

    const snapshot = workingMemory.get();
    const sandbox = await ctx.getSandbox();
    const day = new Date().toISOString().slice(0, 10);
    const path = `memory/${day}.md`;
    const existing = await sandbox.readTextFile({ path });
    await sandbox.writeTextFile({
      path,
      content: `${existing ?? `# ${day}\n\n`}- ${kind}: ${key} — ${value}\n`,
    });

    const durable = await upsertMemory({
      kind,
      key: kind === "focus" ? "current" : key,
      value,
      owner,
      status: kind === "loop" ? "open" : null,
    });

    return {
      ...snapshot,
      durable: durable.ok
        ? "saved"
        : durable.skipped
          ? "skipped"
          : `failed: ${durable.reason}`,
    };
  },
});
