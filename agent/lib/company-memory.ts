import { getInsforge, insforgeErrorMessage, isInsforgeConfigured } from "./insforge";
import { getTenantId } from "./tenant";

export { DEFAULT_TENANT_ID, getTenantId } from "./tenant";

export type DurableMemoryKind = "fact" | "preference" | "focus" | "loop";
export type DurableMemoryOwner = "aki" | "pentridge" | "agent";
export type DurableLoopStatus = "open" | "waiting" | "done";

export interface DurableMemory {
  id: string;
  tenant_id: string;
  kind: DurableMemoryKind;
  key: string;
  value: string;
  owner: DurableMemoryOwner;
  status: DurableLoopStatus | null;
  created_at: string;
  updated_at: string;
}

export interface DurableDecision {
  id: string;
  tenant_id: string;
  decision: string;
  rationale: string;
  decided_at: string;
  created_at: string;
  updated_at: string;
}

export type DurableWriteResult<T> =
  | { ok: true; data: T }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; reason: string };

function skip(reason: string): { ok: false; skipped: true; reason: string } {
  return { ok: false, skipped: true, reason };
}

function fail(reason: string): { ok: false; reason: string } {
  return { ok: false, reason };
}

export async function upsertMemory(input: {
  kind: DurableMemoryKind;
  key: string;
  value: string;
  owner?: DurableMemoryOwner;
  status?: DurableLoopStatus | null;
  tenantId?: string;
}): Promise<DurableWriteResult<DurableMemory>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  const tenantId = input.tenantId ?? getTenantId();
  const owner = input.owner ?? "aki";
  const status = input.kind === "loop" ? (input.status ?? "open") : null;
  const row = {
    tenant_id: tenantId,
    kind: input.kind,
    key: input.key,
    value: input.value,
    owner,
    status,
  };

  try {
    const existing = await client.database
      .from("memories")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("kind", input.kind)
      .eq("key", input.key)
      .limit(1);

    if (existing.error) {
      return fail(insforgeErrorMessage(existing.error));
    }

    const existingId = existing.data?.[0]?.id as string | undefined;

    if (existingId) {
      const updated = await client.database
        .from("memories")
        .update({
          value: input.value,
          owner,
          status,
        })
        .eq("id", existingId)
        .select();

      if (updated.error) {
        return fail(insforgeErrorMessage(updated.error));
      }

      return { ok: true, data: updated.data?.[0] as DurableMemory };
    }

    const inserted = await client.database.from("memories").insert([row]).select();
    if (inserted.error) {
      return fail(insforgeErrorMessage(inserted.error));
    }

    return { ok: true, data: inserted.data?.[0] as DurableMemory };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}

export async function listMemories(
  tenantId = getTenantId(),
): Promise<DurableWriteResult<DurableMemory[]>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  try {
    const result = await client.database
      .from("memories")
      .select()
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (result.error) {
      return fail(insforgeErrorMessage(result.error));
    }

    return { ok: true, data: (result.data ?? []) as DurableMemory[] };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}

export async function upsertDecision(input: {
  id: string;
  decision: string;
  rationale: string;
  decidedAt: string;
  tenantId?: string;
}): Promise<DurableWriteResult<DurableDecision>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  const tenantId = input.tenantId ?? getTenantId();
  const row = {
    id: input.id,
    tenant_id: tenantId,
    decision: input.decision,
    rationale: input.rationale,
    decided_at: input.decidedAt,
  };

  try {
    const existing = await client.database
      .from("decisions")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("id", input.id)
      .limit(1);

    if (existing.error) {
      return fail(insforgeErrorMessage(existing.error));
    }

    if (existing.data?.[0]?.id) {
      const updated = await client.database
        .from("decisions")
        .update({
          decision: input.decision,
          rationale: input.rationale,
          decided_at: input.decidedAt,
        })
        .eq("tenant_id", tenantId)
        .eq("id", input.id)
        .select();

      if (updated.error) {
        return fail(insforgeErrorMessage(updated.error));
      }

      return { ok: true, data: updated.data?.[0] as DurableDecision };
    }

    const inserted = await client.database.from("decisions").insert([row]).select();
    if (inserted.error) {
      return fail(insforgeErrorMessage(inserted.error));
    }

    return { ok: true, data: inserted.data?.[0] as DurableDecision };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}

export async function listDecisions(
  tenantId = getTenantId(),
): Promise<DurableWriteResult<DurableDecision[]>> {
  if (!isInsforgeConfigured()) {
    return skip("INSFORGE_URL / INSFORGE_API_KEY are not set.");
  }

  const client = getInsforge();
  if (!client) {
    return skip("InsForge client is not available.");
  }

  try {
    const result = await client.database
      .from("decisions")
      .select()
      .eq("tenant_id", tenantId)
      .order("decided_at", { ascending: false });

    if (result.error) {
      return fail(insforgeErrorMessage(result.error));
    }

    return { ok: true, data: (result.data ?? []) as DurableDecision[] };
  } catch (error) {
    return fail(insforgeErrorMessage(error));
  }
}
