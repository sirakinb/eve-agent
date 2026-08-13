import { defineMcpClientConnection } from "eve/connections";
import { approveWrites, requireAppToken } from "../lib/mcp-approval";

export default defineMcpClientConnection({
  url: "https://mcp.vercel.com",
  description:
    "Vercel: projects, deployments, build and runtime logs, and deploy_to_vercel. Use to inspect Pentridge sites and ship previews. Ask Aki in iMessage before a public deploy, then call the tool — it will run. Do not buy domains, credits, or plan upgrades.",
  auth: requireAppToken("VERCEL_TOKEN"),
  tools: {
    block: [
      "buy_pro",
      "buy_credits",
      "buy_addon",
      "buy_domain",
      "get_purchase_quote",
    ],
  },
  approval: approveWrites,
});
