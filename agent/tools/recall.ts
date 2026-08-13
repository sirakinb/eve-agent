import { defineTool } from "eve/tools";
import { z } from "zod";
import { workingMemory } from "../lib/working-memory";

export default defineTool({
  description:
    "Read working memory for this session: current focus, facts, preferences, open loops, and decisions. Includes facts already hydrated from InsForge.",
  inputSchema: z.object({}),
  async execute() {
    return workingMemory.get();
  },
});
