import { gateway } from "ai";

/**
 * Seedance 2.5 via Vercel AI Gateway. One slug covers text-to-video,
 * image-to-video (first/last frames), and reference-to-video. Chosen over
 * MiniMax H3 because the gateway cannot run H3 as an async job and H3's
 * single-request generations (~14 min measured) exceed Vercel function limits.
 *
 * Generation runs as a detached gateway job (doStart/doStatus) because this
 * plan caps functions at 300s while generations measure ~4+ minutes: the
 * start tool returns immediately and the agent sleeps durably between checks.
 */
export const VIDEO_MODEL = "bytedance/seedance-2.5";

export const VIDEO_OUTPUT_DIR = "generated";

function detectImageMediaType(bytes: Uint8Array): string {
  if (bytes.length > 2 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length > 11 && bytes[8] === 0x57 && bytes[9] === 0x45) return "image/webp";
  return "image/png";
}

function toFile(bytes: Uint8Array) {
  return {
    type: "file" as const,
    mediaType: detectImageMediaType(bytes),
    data: bytes,
  };
}

export type StartVideoClipInput = {
  prompt: string;
  duration?: number;
  aspectRatio?: `${number}:${number}` | "adaptive";
  generateAudio?: boolean;
  firstFrame?: Uint8Array;
  lastFrame?: Uint8Array;
  references?: Uint8Array[];
  abortSignal?: AbortSignal;
};

export async function startVideoClip(input: StartVideoClipInput) {
  const hasFirst = Boolean(input.firstFrame);
  const hasReferences = (input.references?.length ?? 0) > 0;

  const frameImages =
    input.firstFrame && input.lastFrame
      ? [
          { image: toFile(input.firstFrame), frameType: "first_frame" as const },
          { image: toFile(input.lastFrame), frameType: "last_frame" as const },
        ]
      : undefined;

  const image =
    input.firstFrame && !input.lastFrame ? toFile(input.firstFrame) : undefined;

  // Providers reject "adaptive" (and sometimes a missing ratio) for text-only
  // generation; adaptive is only meaningful with input media.
  const textOnly = !hasFirst && !hasReferences;
  const aspectRatio =
    textOnly && (!input.aspectRatio || input.aspectRatio === "adaptive")
      ? ("16:9" as const)
      : input.aspectRatio;

  const model = gateway.videoModel(VIDEO_MODEL);
  const started = await model.doStart({
    prompt: input.prompt,
    n: 1,
    aspectRatio,
    // Seedance meters cost by pixels x frames (~$1.16 per 5s at 720p24,
    // ~2x that at 1080p). Pin 720p so a provider default change can't
    // silently raise per-clip cost.
    resolution: "1280x720",
    duration: input.duration ?? 5,
    fps: undefined,
    seed: undefined,
    image,
    frameImages,
    inputReferences: input.references?.map(toFile),
    generateAudio: input.generateAudio,
    providerOptions: {},
    abortSignal: input.abortSignal,
  });

  const metadata = started.providerMetadata as
    | { gateway?: { asyncJob?: { jobId?: unknown } } }
    | undefined;
  const jobId = metadata?.gateway?.asyncJob?.jobId;

  return {
    operation: started.operation,
    jobId: typeof jobId === "string" ? jobId : undefined,
    warnings: started.warnings,
  };
}

export async function checkVideoClip(operation: unknown) {
  const model = gateway.videoModel(VIDEO_MODEL);
  return model.doStatus({ operation: operation as never });
}
