/** InsForge tenant for this agent deploy. One client company per deploy by default. */
export const DEFAULT_TENANT_ID = "pentridge";

/**
 * Tenant id for company brain rows (memories, decisions, documents).
 * Set COMPANY_TENANT_ID per client deploy so data never crosses companies.
 */
export function getTenantId(): string {
  const fromEnv = process.env.COMPANY_TENANT_ID?.trim();
  return fromEnv || DEFAULT_TENANT_ID;
}
