import { defineMcpClientConnection } from "eve/connections";
import { approveWrites, requireBearer } from "../lib/mcp-approval";

export default defineMcpClientConnection({
  url: "https://mcp.apify.com",
  description:
    "Apify: search the Actor store, inspect input schemas, run scrapers/crawlers, and read run datasets. Search Actors first; fetch-actor-details before call-actor. For TikTok, prefer a well-used store Actor such as clockworks/tiktok-scraper unless Aki names another. Prefer silent tools (search-actors, fetch-actor-details, call-actor, get-actor-run) — never widget variants. Ask Aki in chat before a paid/run-cost Actor, then run it. Paginate large datasets. Do not invent scrape results.",
  headers: {
    Authorization: requireBearer("APIFY_TOKEN"),
  },
  tools: {
    block: [
      "search-actors-widget",
      "fetch-actor-details-widget",
      "call-actor-widget",
      "get-actor-run-widget",
    ],
  },
  approval: approveWrites,
});
