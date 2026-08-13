/** Photon iMessage has no Approve/Cancel buttons; writes from that number run. */
export const IMESSAGE_AUTHENTICATOR = "imessage";

/** Connection tool names arrive qualified as `<connection>__<tool>`. */
export function bareToolName(toolName: string): string {
  const separator = toolName.indexOf("__");
  return separator === -1 ? toolName : toolName.slice(separator + 2);
}

export function isReadTool(toolName: string): boolean {
  const name = bareToolName(toolName);
  return (
    /^(get_|list_|search_|read_|check_|describe_|auth_)/.test(name) ||
    name.includes("_read") ||
    name.endsWith("_documentation")
  );
}

export function isIMessageSession(session: {
  auth?: { current?: { authenticator?: string } | null };
}): boolean {
  return session.auth?.current?.authenticator === IMESSAGE_AUTHENTICATOR;
}

export function approveWrites(_ctx?: { toolName?: string }) {
  // iMessage cannot click eve's Approve/Cancel buttons, so MCP writes run
  // without a framework pause. Aki still confirms in the chat first.
  return "not-applicable";
}

export function requireAppToken(envName: string) {
  return {
    getToken: async () => {
      const token = process.env[envName];
      if (!token) {
        throw new Error(`${envName} is not configured`);
      }
      return { token };
    },
  };
}

export function requireHeader(envName: string) {
  return () => {
    const value = process.env[envName];
    if (!value) {
      throw new Error(`${envName} is not configured`);
    }
    return value;
  };
}
