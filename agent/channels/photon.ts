import { connectPhotonCredentials } from "@vercel/connect/eve";
import { photonIMessageChannel } from "eve/channels/photon";
import { IMESSAGE_AUTHENTICATOR } from "../lib/mcp-approval";
import { formatPhotonHitl } from "../lib/photon-hitl";
import {
  GENERATE_IMAGE_TOOL,
  GENERATE_VIDEO_CHECK_TOOL,
  GENERATE_VIDEO_TOOL,
  generatedMediaFromToolOutput,
  postGeneratedMediaToThread,
} from "../lib/photon-media";
import {
  hydrateInboundMedia,
  registerPhotonThread,
} from "../lib/photon-inbound-media";
import { hydrateVoiceNote } from "../lib/photon-voice";
import { approveSessionLimit } from "../lib/session-limit";

const credentials = connectPhotonCredentials("photon/eve-agent");

export default photonIMessageChannel({
  credentials,
  turnPolicy: "steer",
  async onMessage(ctx, message) {
    registerPhotonThread(ctx.thread);
    const voice = await hydrateVoiceNote(message, ctx.thread);
    const media = await hydrateInboundMedia(message, ctx.thread);
    const context = [
      ...(voice ? [voice.context] : []),
      ...(media ? media.context : []),
    ];
    return {
      auth: {
        authenticator: IMESSAGE_AUTHENTICATOR,
        principalType: "user",
        principalId: ctx.thread.id,
        attributes: {},
      },
      ...(context.length > 0 ? { context } : {}),
    };
  },
  events: {
    // TEMP diagnostics: surface session ids + lifecycle in Vercel logs while
    // we dig out the wedged parked session. Remove once resolved.
    async "turn.started"(_data, channel, ctx) {
      // Keep the thread registry warm so imessage_save_attachment can reach
      // the adapter even when the turn runs in a different invocation than
      // the webhook that accepted the message.
      registerPhotonThread(channel.thread);
      console.log("[diag] turn.started session=", ctx.session.id);
    },
    async "turn.cancelled"(_data, _channel, ctx) {
      console.log("[diag] turn.cancelled session=", ctx.session.id);
    },
    async "turn.completed"(_data, _channel, ctx) {
      console.log("[diag] turn.completed session=", ctx.session.id);
    },
    async "turn.failed"(data, channel, ctx) {
      console.log("[diag] turn.failed session=", ctx.session.id, data);
      if (channel.thread) {
        await channel.thread.post({
          markdown: "I hit an error while handling your request. Please try again.",
        });
      }
    },
    async "session.waiting"(_data, channel, ctx) {
      console.log("[diag] session.waiting session=", ctx.session.id);

      // Session-limit continuations stashed by input.requested are answered
      // here: responding inside the input.requested handler self-deadlocks
      // because the park only commits after that handler returns. By
      // session.waiting the park is durable and the loopback respond lands.
      const state = channel.state as { pendingLimitRequestIds?: string[] };
      const pending = state.pendingLimitRequestIds ?? [];
      if (pending.length === 0) return;

      try {
        await approveSessionLimit(ctx.session.id, pending);
        state.pendingLimitRequestIds = [];
        if (channel.thread) {
          await channel.thread.post({
            markdown:
              "Hit the session token guardrail — auto-approved, continuing.",
          });
        }
      } catch (error) {
        console.error("[photon] session-limit auto-approve failed:", error);
        state.pendingLimitRequestIds = [];
        if (channel.thread) {
          await channel.thread.post({
            markdown:
              "Hit the session token guardrail and could not auto-approve. Tell Claude Code to unstick the session.",
          });
        }
      }
    },
    async "session.failed"(data) {
      console.log("[diag] session.failed", data);
    },
    async "actions.requested"(_data, _channel, ctx) {
      console.log("[diag] actions.requested session=", ctx.session.id);
    },
    async "input.requested"(data, channel, ctx) {
      console.log(
        "[diag] input.requested session=",
        ctx.session.id,
        "requests=",
        JSON.stringify(
          data.requests.map((r) => ({ requestId: r.requestId, kind: r.kind })),
        ),
      );
      if (!channel.thread) return;

      // iMessage has no buttons, so the session-limit Approve/Stop prompt is
      // unanswerable from the thread. Stash it; the session.waiting handler
      // auto-approves once the park has committed.
      const limits = data.requests.filter((r) => r.kind === "session-limit");
      const rest = data.requests.filter((r) => r.kind !== "session-limit");

      if (limits.length > 0) {
        const state = channel.state as { pendingLimitRequestIds?: string[] };
        state.pendingLimitRequestIds = [
          ...new Set([
            ...(state.pendingLimitRequestIds ?? []),
            ...limits.map((r) => r.requestId),
          ]),
        ];
      }

      const markdown = formatPhotonHitl(rest);
      if (!markdown) return;
      await channel.thread.post({ markdown });
    },
    async "action.result"(data, channel, ctx) {
      registerPhotonThread(channel.thread);
      if (data.status !== "completed") return;
      if (data.result.kind !== "tool-result") return;
      if (
        data.result.toolName !== GENERATE_IMAGE_TOOL &&
        data.result.toolName !== GENERATE_VIDEO_TOOL &&
        data.result.toolName !== GENERATE_VIDEO_CHECK_TOOL
      ) {
        return;
      }
      if (!channel.thread) return;

      const media = generatedMediaFromToolOutput(data.result.output);
      if (!media) {
        console.error("Generated media tool finished without postable files", {
          toolName: data.result.toolName,
          output: data.result.output,
        });
        return;
      }

      try {
        const sandbox = await ctx.getSandbox();
        const posted = await postGeneratedMediaToThread(
          channel.thread,
          sandbox,
          media,
        );
        if (posted === 0) {
          console.error("Generated media was missing from the sandbox", {
            paths: media.map((item) => item.path),
          });
        }
      } catch (error) {
        console.error("Failed to post generated media to iMessage", error);
      }
    },
  },
});
