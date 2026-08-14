import { eveChannel } from "eve/channels/eve";
import { httpBasic, localDev, placeholderAuth, vercelOidc } from "eve/channels/auth";

// Server-to-server credential for the Agent Workspace chat surface
// (pentridge-app). Constant-time comparison via httpBasic; only active when
// the secret is configured.
const workspaceAuth = process.env.WORKSPACE_CHAT_SECRET
  ? [
      httpBasic({
        username: "workspace",
        password: process.env.WORKSPACE_CHAT_SECRET,
      }),
    ]
  : [];

export default eveChannel({
  auth: [
    // Lets the eve TUI and your Vercel deployments reach the deployed agent.
    vercelOidc(),
    // Open on localhost for `eve dev` and the REPL; ignored in production.
    localDev(),
    ...workspaceAuth,
    // This placeholder will not allow browser requests in production.
    // Replace it with your app's auth provider, like Auth.js or Clerk,
    // or use none() for a public demo.
    placeholderAuth(),
  ],
});
