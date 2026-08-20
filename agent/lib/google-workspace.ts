import { JWT } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
];

let cached: JWT | null | undefined;

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_IMPERSONATE_USER,
  );
}

function getJwt(): JWT {
  if (cached) return cached;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const subject = process.env.GOOGLE_IMPERSONATE_USER;
  if (!raw || !subject) {
    throw new Error(
      "GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_IMPERSONATE_USER are not configured",
    );
  }

  const sa = JSON.parse(raw) as {
    client_email: string;
    private_key: string;
  };

  cached = new JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: SCOPES,
    subject,
  });
  return cached;
}

async function googleFetch(url: string, init?: RequestInit): Promise<unknown> {
  const jwt = getJwt();
  const token = await jwt.getAccessToken();
  if (!token.token) {
    throw new Error("Google access token was empty");
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token.token}`,
      Accept: "application/json",
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
    const err =
      typeof body === "object" && body && "error" in body
        ? JSON.stringify((body as { error: unknown }).error)
        : text.slice(0, 400);
    throw new Error(`Google ${response.status}: ${err || response.statusText}`);
  }

  return body;
}

export async function driveSearch(query: string, pageSize = 25) {
  const params = new URLSearchParams({
    q: query,
    pageSize: String(pageSize),
    fields:
      "files(id,name,mimeType,parents,modifiedTime,webViewLink,owners(emailAddress))",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });
  return googleFetch(`https://www.googleapis.com/drive/v3/files?${params}`);
}

export async function driveGet(fileId: string) {
  const params = new URLSearchParams({
    fields:
      "id,name,mimeType,parents,modifiedTime,webViewLink,size,owners(emailAddress)",
    supportsAllDrives: "true",
  });
  return googleFetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`,
  );
}

export async function driveCreate(input: {
  name: string;
  mimeType: string;
  parentId?: string;
}) {
  return googleFetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      mimeType: input.mimeType,
      parents: input.parentId ? [input.parentId] : undefined,
    }),
  });
}

export async function driveUploadFile(input: {
  name: string;
  mimeType: string;
  content: Uint8Array;
  parentId?: string;
}) {
  const jwt = getJwt();
  const token = await jwt.getAccessToken();
  if (!token.token) {
    throw new Error("Google access token was empty");
  }

  // Resumable upload: works for any file size, unlike multipart (5MB cap).
  const start = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.token}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": input.mimeType,
        "X-Upload-Content-Length": String(input.content.byteLength),
      },
      body: JSON.stringify({
        name: input.name,
        parents: input.parentId ? [input.parentId] : undefined,
      }),
    },
  );
  if (!start.ok) {
    const text = await start.text();
    throw new Error(`Google ${start.status}: ${text.slice(0, 400) || start.statusText}`);
  }
  const sessionUrl = start.headers.get("location");
  if (!sessionUrl) {
    throw new Error("Google did not return a resumable upload session URL");
  }

  const upload = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": input.mimeType },
    body: input.content,
  });
  const text = await upload.text();
  if (!upload.ok) {
    throw new Error(`Google ${upload.status}: ${text.slice(0, 400) || upload.statusText}`);
  }
  return JSON.parse(text) as {
    id: string;
    name: string;
    mimeType: string;
    size?: string;
    webViewLink?: string;
  };
}

export async function docsGet(documentId: string) {
  return googleFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`,
  );
}

export async function docsReplaceAll(documentId: string, find: string, replace: string) {
  return googleFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: true },
              replaceText: replace,
            },
          },
        ],
      }),
    },
  );
}

export async function docsInsertText(documentId: string, text: string, index = 1) {
  return googleFetch(
    `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [{ insertText: { location: { index }, text } }],
      }),
    },
  );
}

export async function sheetsGet(spreadsheetId: string, range?: string) {
  if (range) {
    return googleFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`,
    );
  }
  return googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,properties.title,sheets.properties`,
  );
}

export async function sheetsUpdate(
  spreadsheetId: string,
  range: string,
  values: string[][],
) {
  const params = new URLSearchParams({ valueInputOption: "USER_ENTERED" });
  return googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?${params}`,
    {
      method: "PUT",
      body: JSON.stringify({ range, values }),
    },
  );
}

export async function sheetsAppend(
  spreadsheetId: string,
  range: string,
  values: string[][],
) {
  const params = new URLSearchParams({
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
  });
  return googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?${params}`,
    {
      method: "POST",
      body: JSON.stringify({ values }),
    },
  );
}

export async function slidesGet(presentationId: string) {
  return googleFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}`,
  );
}

export async function slidesReplaceAll(
  presentationId: string,
  find: string,
  replace: string,
) {
  return googleFetch(
    `https://slides.googleapis.com/v1/presentations/${encodeURIComponent(presentationId)}:batchUpdate`,
    {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            replaceAllText: {
              containsText: { text: find, matchCase: true },
              replaceText: replace,
            },
          },
        ],
      }),
    },
  );
}

export const GOOGLE_MIME = {
  folder: "application/vnd.google-apps.folder",
  doc: "application/vnd.google-apps.document",
  sheet: "application/vnd.google-apps.spreadsheet",
  slide: "application/vnd.google-apps.presentation",
} as const;
