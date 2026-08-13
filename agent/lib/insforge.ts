import { createAdminClient, type InsForgeClient } from "@insforge/sdk";

let cached: InsForgeClient | null | undefined;

export function isInsforgeConfigured(): boolean {
  return Boolean(process.env.INSFORGE_URL && process.env.INSFORGE_API_KEY);
}

export function getInsforge(): InsForgeClient | null {
  if (cached !== undefined) {
    return cached;
  }

  const baseUrl = process.env.INSFORGE_URL;
  const apiKey = process.env.INSFORGE_API_KEY;

  if (!baseUrl || !apiKey) {
    cached = null;
    return cached;
  }

  cached = createAdminClient({ baseUrl, apiKey });
  return cached;
}

export function insforgeErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
