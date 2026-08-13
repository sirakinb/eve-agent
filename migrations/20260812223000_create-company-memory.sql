-- Durable company memory for the Pentridge head agent.
-- Tenant-zero is always `pentridge`. RLS stays closed to anon/authenticated;
-- the eve runtime writes through the InsForge admin API key (project_admin).

CREATE TABLE public.memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL DEFAULT 'pentridge',
  kind TEXT NOT NULL CHECK (kind IN ('fact', 'preference', 'focus', 'loop')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  owner TEXT NOT NULL DEFAULT 'aki' CHECK (owner IN ('aki', 'pentridge', 'agent')),
  status TEXT CHECK (status IS NULL OR status IN ('open', 'waiting', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, kind, key)
);

CREATE TABLE public.decisions (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL DEFAULT 'pentridge',
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, id)
);

CREATE INDEX memories_tenant_updated_idx
  ON public.memories (tenant_id, updated_at DESC);

CREATE INDEX decisions_tenant_decided_idx
  ON public.decisions (tenant_id, decided_at DESC);

CREATE TRIGGER memories_updated_at
  BEFORE UPDATE ON public.memories
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

CREATE TRIGGER decisions_updated_at
  BEFORE UPDATE ON public.decisions
  FOR EACH ROW
  EXECUTE FUNCTION system.update_updated_at();

ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.memories FROM anon, authenticated;
REVOKE ALL ON public.decisions FROM anon, authenticated;
