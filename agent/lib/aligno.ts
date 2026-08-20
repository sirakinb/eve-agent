const DEFAULT_BASE_URL = "https://alignocrm.com";

export function getAlignoBaseUrl(): string {
  return (process.env.ALIGNO_API_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
}

export function isAlignoConfigured(): boolean {
  return Boolean(process.env.ALIGNO_API_KEY);
}

async function alignoFetch(path: string, init?: RequestInit): Promise<unknown> {
  const apiKey = process.env.ALIGNO_API_KEY;
  if (!apiKey) {
    throw new Error("ALIGNO_API_KEY is not configured");
  }

  const response = await fetch(`${getAlignoBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "x-api-key": apiKey,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as { message: unknown }).message)
        : text.slice(0, 300);
    throw new Error(`AlignoCRM ${response.status}: ${message || response.statusText}`);
  }

  return body;
}

export async function exportContacts() {
  return alignoFetch("/api/export/contacts");
}

export async function exportPipeline(pipelineId?: string) {
  const query = pipelineId
    ? `?pipelineId=${encodeURIComponent(pipelineId)}`
    : "";
  return alignoFetch(`/api/export/pipeline${query}`);
}

export async function createContact(input: {
  name: string;
  email?: string;
  phone?: string;
  source: string;
  workspace_id?: string;
}) {
  return alignoFetch("/api/contacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function createLead(input: {
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  details?: string;
  pipeline_id?: string;
  pipeline_name?: string;
  stage_id?: string;
  stage_name?: string;
}) {
  return alignoFetch("/api/webhooks/lead", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
