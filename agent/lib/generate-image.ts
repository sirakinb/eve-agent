import { generateImage, gateway } from "ai";

/** Grok Imagine Image 2.0 via Vercel AI Gateway. */
export const GROK_IMAGINE_IMAGE_MODEL = "xai/grok-imagine-image-2.0";

export const IMAGE_OUTPUT_DIR = "generated";

export const GROK_ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
] as const;

export type GrokAspectRatio = (typeof GROK_ASPECT_RATIOS)[number];

export type ImageResolution = "1k" | "2k";

/** Ratios people ask for that Grok 2.0 rejects with HTTP 422. */
const ASPECT_RATIO_ALIASES: Record<string, GrokAspectRatio> = {
  "4:5": "3:4",
  "5:4": "4:3",
};

export type GenerateGrokImageInput = {
  prompt: string;
  n?: number;
  resolution?: ImageResolution;
  aspectRatio?: string;
  sourceImages?: Uint8Array[];
  abortSignal?: AbortSignal;
};

export function resolveGrokAspectRatio(
  aspectRatio: string | undefined,
): GrokAspectRatio | undefined {
  if (!aspectRatio) return undefined;
  return ASPECT_RATIO_ALIASES[aspectRatio] ?? (aspectRatio as GrokAspectRatio);
}

export async function generateGrokImage(input: GenerateGrokImageInput) {
  const prompt =
    input.sourceImages && input.sourceImages.length > 0
      ? { text: input.prompt, images: input.sourceImages }
      : input.prompt;

  return generateImage({
    model: gateway.imageModel(GROK_IMAGINE_IMAGE_MODEL),
    prompt,
    n: input.n ?? 1,
    aspectRatio: resolveGrokAspectRatio(input.aspectRatio),
    providerOptions: {
      xai: { resolution: input.resolution ?? "1k" },
    },
    abortSignal: input.abortSignal,
  });
}

export function gatewayErrorMessage(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if (!(current instanceof Error)) break;
    const message = current.message;
    if (message && message !== "[object Object]" && message !== "AI_APICallError") {
      parts.push(message);
    }
    const status = (current as { statusCode?: unknown }).statusCode;
    if (typeof status === "number") parts.push(`HTTP ${status}`);
    current = current.cause;
  }
  const text = [...new Set(parts)].join(": ");
  return (text || "Image generation failed").slice(0, 400);
}

export function extensionForMediaType(mediaType: string): string {
  const type = mediaType.toLowerCase().split(";")[0]?.trim();
  if (type === "image/jpeg" || type === "image/jpg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "png";
}

export function safeImageFilename(name: string, ext: string): string {
  const stem = name
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const suffix = Date.now().toString(36);
  return `${stem || "image"}-${suffix}.${ext}`;
}
