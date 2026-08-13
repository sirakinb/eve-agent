import { defineMcpClientConnection } from "eve/connections";
import { approveWrites, requireAppToken } from "../lib/mcp-approval";

export default defineMcpClientConnection({
  url: "https://api.githubcopilot.com/mcp/",
  description:
    "GitHub: code repositories, files, issues, pull requests, and Actions only. Not for company positioning/offer/content — those live in InsForge via save_document. List/read first. Ask Aki before pushing code. Never put company docs in the agent deploy repo.",
  auth: requireAppToken("GITHUB_TOKEN"),
  headers: {
    "X-MCP-Toolsets": "repos,issues,pull_requests,actions,users",
  },
  approval: approveWrites,
});
