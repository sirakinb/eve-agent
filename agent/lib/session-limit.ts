import { Client } from "eve/client";

function resolveHost(): string {
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;
  return `http://127.0.0.1:${process.env.PORT ?? "2000"}`;
}

/**
 * Answers a session-limit continuation with "continue". Channel event
 * handlers cannot respond to input requests directly, so this loops back
 * through the agent's own eve channel over HTTP using the workspace
 * shared-secret auth (same credential the Agent Workspace chat uses).
 */
export async function approveSessionLimit(
  sessionId: string,
  requestIds: readonly string[],
): Promise<void> {
  const secret = process.env.WORKSPACE_CHAT_SECRET;
  if (!secret) throw new Error("WORKSPACE_CHAT_SECRET is not configured");

  const client = new Client({
    host: resolveHost(),
    auth: { basic: { username: "workspace", password: secret } },
  });

  const session = client.sessions.attach(sessionId);
  const respond = session.respond(
    requestIds.map((requestId) => ({ requestId, optionId: "continue" })),
  );

  // The loopback POST must not wedge the workflow step if it stalls.
  await Promise.race([
    respond,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("session-limit approval timed out after 15s")),
        15_000,
      ),
    ),
  ]);
}
