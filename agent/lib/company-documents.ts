import { getInsforge, insforgeErrorMessage, isInsforgeConfigured } from "./insforge";
import { type DurableWriteResult } from "./company-memory";
import { getTenantId } from "./tenant";

export interface CompanyDocument {
  id: string;
  tenant_id: string;
  slug: string;
  title: string;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface CompanyDocumentSummary {
  slug: string;
  title: string;
  updated_at: string;
}

function skip(reason: string): { ok: false; skipped: true; reason: string } {
  return { ok: false, skipped: true, reason };
}

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

export async function upsertDocument(input: {
  slug: string;
  title: string;
  body: string;
  tenantId?: string;
}): Promise<DurableWriteResult<CompanyDocument>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  const tenantId = input.tenantId ?? getTenantId();
  const slug = input.slug.trim();
  const title = input.title.trim();
  const body = input.body;

  if (!slug || !title) {
    return fail("slug and title are required.");
  }

  try {
    const existing = await client.database
      .from("company_documents")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .limit(1);

    if (existing.error) {
      return fail(insforgeErrorMessage(existing.error));
    }

    const existingId = existing.data?.[0]?.id as string | undefined;

    if (existingId) {
      const updated = await client.database
        .from("company_documents")
        .update({ title, body })
        .eq("id", existingId)
        .select();

      if (updated.error) {
        return fail(insforgeErrorMessage(updated.error));
      }

      return { ok: true, data: updated.data?.[0] as CompanyDocument };
    }

    const inserted = await client.database
      .from("company_documents")
      .insert([{ tenant_id: tenantId, slug, title, body }])
      .select();

    if (inserted.error) {
      return fail(insforgeErrorMessage(inserted.error));
    }

    return { ok: true, data: inserted.data?.[0] as CompanyDocument };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}

export async function getDocument(
  slug: string,
  tenantId = getTenantId(),
): Promise<DurableWriteResult<CompanyDocument | null>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  try {
    const result = await client.database
      .from("company_documents")
      .select()
      .eq("tenant_id", tenantId)
      .eq("slug", slug.trim())
      .limit(1);

    if (result.error) {
      return fail(insforgeErrorMessage(result.error));
    }

    return {
      ok: true,
      data: (result.data?.[0] as CompanyDocument | undefined) ?? null,
    };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}

export async function listDocuments(
  tenantId = getTenantId(),
): Promise<DurableWriteResult<CompanyDocumentSummary[]>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  try {
    const result = await client.database
      .from("company_documents")
      .select("slug, title, updated_at")
      .eq("tenant_id", tenantId)
      .order("slug", { ascending: true });

    if (result.error) {
      return fail(insforgeErrorMessage(result.error));
    }

    return {
      ok: true,
      data: (result.data ?? []) as CompanyDocumentSummary[],
    };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}
