import { defineTool } from "eve/tools";
import { z } from "zod";
import { startVideoClip, VIDEO_MODEL } from "../lib/generate-video";

const aspectRatioSchema = z
  .enum(["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"])
  .describe(
    "21:9 cinematic, 16:9 landscape, 9:16 story/TikTok, 1:1 square. adaptive inherits from a first-frame image.",
  );

export default defineTool({
  description:
    "Start generating a short video with Seedance 2.5 through the Vercel AI Gateway (HD mp4, 5–10 seconds, default 5s 16:9). Confirm with Aki in chat first unless they already asked to generate a specific video this turn, and tell them it takes a few minutes. This tool returns immediately with an operation_json handle — after calling it, sleep ~120 seconds with the sleep tool, then call generate_video_check with that operation_json. Optional first/last frame from sandbox images, or reference images (not both).",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("Motion brief: subject, camera, lighting, and what happens over the clip."),
    duration: z
      .number()
      .int()
      .min(5)
      .max(10)
      .optional()
      .describe("Clip length in seconds. Default 5. Longer clips cost more Gateway credits."),
    aspect_ratio: aspectRatioSchema.optional(),
    generate_audio: z
      .boolean()
      .optional()
      .describe("If true, generate audio with the video when the model supports it."),
    first_frame_path: z
      .string()
      .min(1)
      .optional()
      .describe("Sandbox path of a still to animate as the first frame."),
    last_frame_path: z
      .string()
      .min(1)
      .optional()
      .describe("Sandbox path of a still for the ending frame. Use with first_frame_path."),
    source_paths: z
      .array(z.string().min(1))
      .max(3)
      .optional()
      .describe(
        "Sandbox paths of reference images. Mutually exclusive with first/last frame. Refer to them in the prompt as [Image 1], [Image 2].",
      ),
  }),
  async execute(
    {
      prompt,
      duration,
      aspect_ratio,
      generate_audio,
      first_frame_path,
      last_frame_path,
      source_paths,
    },
    ctx,
  ) {
    if ((first_frame_path || last_frame_path) && (source_paths?.length ?? 0) > 0) {
      return {
        ok: false,
        reason: "Use first/last frames or source_paths references, not both.",
      };
    }

    if (last_frame_path && !first_frame_path) {
      return {
        ok: false,
        reason: "last_frame_path requires first_frame_path.",
      };
    }

    const sandbox = await ctx.getSandbox();

    async function readSource(path: string): Promise<Uint8Array | { ok: false; reason: string }> {
      const bytes = await sandbox.readBinaryFile({ path });
      if (!bytes || bytes.byteLength === 0) {
        return { ok: false, reason: `Could not read media at ${path}` };
      }
      return bytes;
    }

    let firstFrame: Uint8Array | undefined;
    let lastFrame: Uint8Array | undefined;
    const references: Uint8Array[] = [];

    if (first_frame_path) {
      const bytes = await readSource(first_frame_path);
      if (!(bytes instanceof Uint8Array)) return bytes;
      firstFrame = bytes;
    }
    if (last_frame_path) {
      const bytes = await readSource(last_frame_path);
      if (!(bytes instanceof Uint8Array)) return bytes;
      lastFrame = bytes;
    }
    for (const sourcePath of source_paths ?? []) {
      const bytes = await readSource(sourcePath);
      if (!(bytes instanceof Uint8Array)) return bytes;
      references.push(bytes);
    }

    try {
      const started = await startVideoClip({
        prompt,
        duration: duration ?? 5,
        aspectRatio: aspect_ratio,
        generateAudio: generate_audio,
        firstFrame,
        lastFrame,
        references: references.length > 0 ? references : undefined,
        abortSignal: ctx.abortSignal,
      });

      return {
        ok: true,
        status: "started",
        model: VIDEO_MODEL,
        duration: duration ?? 5,
        aspect_ratio: aspect_ratio ?? null,
        job_id: started.jobId ?? null,
        operation_json: JSON.stringify(started.operation),
        next_step:
          "The video is generating in the background (typically 3–6 minutes). Sleep about 120 seconds with the sleep tool, then call generate_video_check with this exact operation_json. Repeat sleep + check while it reports pending.",
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, reason: message.slice(0, 400) };
    }
  },
});
