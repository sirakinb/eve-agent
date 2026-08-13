import { defineAgent } from "eve";

export default defineAgent({
  // ffmpeg-static must stay external and fully traced ("pkg*") so the ~80MB
  // ffmpeg binary lands in the hosted bundle; bundling inlines only the JS
  // wrapper and voice-note CAF->m4a conversion fails with ENOENT.
  build: { externalDependencies: ["ffmpeg-static", "ffmpeg-static*"] },
  compaction: { thresholdPercent: 0.85 },
  model: "openai/gpt-5.6-luna",
  reasoning: "high",
});
