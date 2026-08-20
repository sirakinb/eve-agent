import { defineTool } from "eve/tools";
import { z } from "zod";
import {
  driveCreate,
  GOOGLE_MIME,
  isGoogleConfigured,
} from "../lib/google-workspace";

export default defineTool({
  description:
    "Create a Google Drive folder, Doc, Sheet, or Slides file as adzo@pentridgemedia.com. Confirm with Aki in chat first, then call — do not wait for Approve tool call.",
  inputSchema: z.object({
    name: z.string().min(1),
    kind: z.enum(["folder", "doc", "sheet", "slide"]),
    parentId: z
      .string()
      .optional()
      .describe("Drive folder id to create inside. Omit for Adzo's My Drive root."),
  }),
  async execute({ name, kind, parentId }) {
    if (!isGoogleConfigured()) {
      return { ok: false, reason: "Google Workspace is not configured" };
    }
    const data = await driveCreate({
      name,
      mimeType: GOOGLE_MIME[kind],
      parentId,
    });
    return { ok: true, data };
  },
});
