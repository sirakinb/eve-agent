import { defineTool } from "eve/tools";
import { z } from "zod";
import { exportPipeline, isAlignoConfigured } from "../lib/aligno";

export default defineTool({
  description:
    "List AlignoCRM pipelines, stages, and deals. Pass pipelineId to export one pipeline. Use when Aki asks about the pipeline, stages, or deals.",
  inputSchema: z.object({
    pipelineId: z
      .string()
      .optional()
      .describe("Optional pipeline UUID. Omit to export all pipelines."),
  }),
  async execute({ pipelineId }) {
    if (!isAlignoConfigured()) {
      return { ok: false, reason: "ALIGNO_API_KEY is not configured" };
    }

    const data = await exportPipeline(pipelineId);
    return { ok: true, data };
  },
});
