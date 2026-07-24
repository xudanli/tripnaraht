/**
 * M6 — Bounded LNS local repair feature flag.
 */

export function isBoundedLnsRepairEnabled(): boolean {
  const v = process.env.BOUNDED_LNS_REPAIR_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
