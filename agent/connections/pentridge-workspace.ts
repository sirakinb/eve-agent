import { defineMcpClientConnection } from "eve/connections";
import { approveWrites, requireBearer } from "../lib/mcp-approval";

// Pentridge Agent Workspace (the internal ops platform). The API key is
// scoped to the Pentridge internal workspace — reads for SEO + social
// analytics and workspace context, plus log_activity write-backs so work
// done here shows up on the workspace's Agent Activity feed.
export default defineMcpClientConnection({
  url: "https://pentridge-api-c7965c42-8e49-4f8a-bb66-4b8724e4606b.fly.dev/mcp",
  description:
    "Pentridge Agent Workspace: live analytics and context for Pentridge's own ops platform. Read the workspace overview/context, SEO & AEO performance (Search Console, GA4, Bing, AI-answer visibility, backlinks), and social stats (TikTok, YouTube). When you complete meaningful work for Pentridge, log it with log_activity (channel + title + summary + payload.highlights) so it appears on the workspace's Agent Activity feed. Data is always scoped to the Pentridge internal workspace by the key.",
  headers: {
    Authorization: requireBearer("PENTRIDGE_WORKSPACE_API_KEY"),
  },
  approval: approveWrites,
});
