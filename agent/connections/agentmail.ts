import { defineMcpClientConnection } from "eve/connections";
import { approveWrites, requireHeader } from "../lib/mcp-approval";

export default defineMcpClientConnection({
  url: "https://mcp.agentmail.to/mcp",
  description:
    "Adzo's own email inbox agentadzo@agentmail.to (display name Adzo). Send, reply, list, search, and draft mail as Adzo — never from Aki's personal Gmail. The API key is inbox-scoped to this address only.",
  headers: {
    "x-api-key": requireHeader("AGENTMAIL_API_KEY"),
  },
  tools: {
    block: [
      "create_inbox",
      "delete_inbox",
      "list_organizations",
      "select_organization",
    ],
  },
  approval: approveWrites,
});
