import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  extensionForMediaType,
  gatewayErrorMessage,
  generateGrokImage,
  GROK_ASPECT_RATIOS,
  GROK_IMAGINE_IMAGE_MODEL,
  IMAGE_OUTPUT_DIR,
  resolveGrokAspectRatio,
  safeImageFilename,
} from "../lib/generate-image";

const aspectRatioSchema = z
  .enum(GROK_ASPECT_RATIOS)
  .describe(
    "Grok-supported aspect ratio. 1:1 square, 3:4 LinkedIn/portrait, 9:16 story, 16:9 landscape. Grok rejects 4:5; use 3:4 instead.",
  );

export default defineTool({
  description:
    "Generate images with Grok Imagine Image 2.0 through the Vercel AI Gateway. Use for carousels, LinkedIn posts, posters, infographics, and other visuals where typography and layout matter. Confirm with Aki in chat first unless they already asked to generate a specific image this turn. Default 1 image at 1k (about 1024px); use 2k (about 2048px) when text must stay readable. Aspect ratio must be one Grok accepts: 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3 (use 3:4 for LinkedIn, not 4:5). Images save under sandbox generated/ and are posted to iMessage automatically. Use google_drive_upload to put them in Drive. For video, use generate_video.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe("Full image brief: subject, layout, typography, colors, and any on-image copy."),
    n: z
      .number()
      .int()
      .min(1)
      .max(4)
      .optional()
      .describe("How many images to generate. Default 1. Each image costs Gateway credits."),
    resolution: z
      .enum(["1k", "2k"])
      .optional()
      .describe("Output tier. 1k for drafts; 2k for carousels, posters, and LinkedIn with readable text."),
    aspect_ratio: aspectRatioSchema.optional(),
    filename: z
      .string()
      .min(1)
      .optional()
      .describe("Optional stem for the saved file, e.g. linkedin-carousel-1."),
    source_paths: z
      .array(z.string().min(1))
      .max(3)
      .optional()
      .describe(
        "Sandbox paths of up to 3 existing images to edit. The prompt then describes the change; unmatched details stay.",
      ),
  }),
  async execute(
    { prompt, n, resolution, aspect_ratio, filename, source_paths },
    ctx,
  ) {
    const sandbox = await ctx.getSandbox();
    const sourceImages: Uint8Array[] = [];

    for (const sourcePath of source_paths ?? []) {
      const bytes = await sandbox.readBinaryFile({ path: sourcePath });
      if (!bytes || bytes.byteLength === 0) {
        return {
          ok: false,
          reason: `Could not read source image at ${sourcePath}`,
        };
      }
      sourceImages.push(bytes);
    }

    const aspectRatio = resolveGrokAspectRatio(aspect_ratio);

    try {
      const result = await generateGrokImage({
        prompt,
        n: n ?? 1,
        resolution: resolution ?? "1k",
        aspectRatio,
        sourceImages: sourceImages.length > 0 ? sourceImages : undefined,
        abortSignal: ctx.abortSignal,
      });

      await sandbox.run({ command: `mkdir -p ${IMAGE_OUTPUT_DIR}` });

      const images = [];
      for (const [index, image] of result.images.entries()) {
        const ext = extensionForMediaType(image.mediaType);
        const stem =
          filename && result.images.length === 1
            ? filename
            : filename
              ? `${filename}-${index + 1}`
              : `image-${index + 1}`;
        const savedName = safeImageFilename(stem, ext);
        const path = `${IMAGE_OUTPUT_DIR}/${savedName}`;
        await sandbox.writeBinaryFile({
          path,
          content: image.uint8Array,
        });
        images.push({
          path,
          filename: savedName,
          mediaType: image.mediaType,
          bytes: image.uint8Array.byteLength,
        });
      }

      return {
        ok: true,
        model: GROK_IMAGINE_IMAGE_MODEL,
        resolution: resolution ?? "1k",
        aspect_ratio: aspectRatio ?? null,
        count: images.length,
        images,
      };
    } catch (error) {
      const reason = gatewayErrorMessage(error);
      console.error("generate_image failed", reason, error);
      return { ok: false, reason };
    }
  },
});
