import { connectPhotonCredentials } from "@vercel/connect/eve";
import { photonIMessageChannel } from "eve/channels/photon";
import { IMESSAGE_AUTHENTICATOR } from "../lib/mcp-approval";
import { formatPhotonHitl } from "../lib/photon-hitl";
import { hydrateVoiceNote } from "../lib/photon-voice";

const credentials = connectPhotonCredentials("photon/eve-agent");

export default photonIMessageChannel({
  credentials,
  turnPolicy: "queue",
  async onMessage(ctx, message) {
    const voice = await hydrateVoiceNote(message, ctx.thread);
    return {
      auth: {
        authenticator: IMESSAGE_AUTHENTICATOR,
        principalType: "user",
        principalId: ctx.thread.id,
        attributes: {},
      },
      ...(voice ? { context: [voice.context] } : {}),
    };
  },
  events: {
    async "input.requested"(data, channel) {
      if (!channel.thread) return;
      const markdown = formatPhotonHitl(data.requests);
      if (!markdown) return;
      await channel.thread.post({ markdown });
    },
  },
});
