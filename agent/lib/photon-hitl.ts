/** iMessage cannot render Chat SDK approval cards. Skip those; print questions. */

type HitlOption = { readonly label: string };

type HitlRequest = {
  readonly kind: string;
  readonly prompt: string;
  readonly options?: readonly HitlOption[];
};

export function formatPhotonHitl(requests: readonly HitlRequest[]): string | null {
  const visible = requests.filter((request) => request.kind !== "tool-approval");
  if (visible.length === 0) return null;

  return visible
    .map((request) => {
      const options = request.options ?? [];
      if (options.length === 0) return request.prompt;
      const lines = options.map((option, index) => `${index + 1}. ${option.label}`);
      return `${request.prompt}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}
