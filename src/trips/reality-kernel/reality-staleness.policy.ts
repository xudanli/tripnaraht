/** Env-driven staleness thresholds for SnapshotValidity (seconds). */

export function getStalenessWarnSec(): number {
  const n = parseInt(String(process.env.REALITY_STALENESS_WARN_SEC ?? '600'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 600;
}

export function getStalenessInvalidSec(): number {
  const n = parseInt(String(process.env.REALITY_STALENESS_INVALID_SEC ?? '86400'), 10);
  return Number.isFinite(n) && n >= 0 ? n : 86400;
}
