/**
 * OR-Tools solver sidecar env (ADR-008).
 * Shadow-only until Release Authorization — never writes Effective Plan by default.
 */

export function resolveOrToolsSolverBaseUrl(): string | null {
  const raw = process.env.OR_TOOLS_SOLVER_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, '');
}

/** When true (default if URL set), providers may be invoked but never authoritative. */
export function isOrToolsRepairShadowEnabled(): boolean {
  const raw = process.env.OR_TOOLS_REPAIR_SHADOW?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'on') return true;
  return resolveOrToolsSolverBaseUrl() != null;
}

export function resolveOrToolsSolverTimeoutMs(): number {
  const n = Number(process.env.OR_TOOLS_SOLVER_TIMEOUT_MS ?? '5000');
  return Number.isFinite(n) && n > 0 ? n : 5000;
}

/**
 * M2 / P4 — MOVE_DAY multi-day shadow. Default OFF.
 * Sidecar must also set OR_TOOLS_MOVE_DAY_SHADOW=1.
 */
export function isOrToolsMoveDayShadowEnabled(): boolean {
  const raw = process.env.OR_TOOLS_MOVE_DAY_SHADOW?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/**
 * M3 / P5 — native OR-Tools CP-SAT for SHIFT. Default OFF.
 * Sidecar must also set OR_TOOLS_NATIVE_CPSAT=1.
 */
export function isOrToolsNativeCpSatEnabled(): boolean {
  const raw = process.env.OR_TOOLS_NATIVE_CPSAT?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

/**
 * M4 — authoritative canary intent flag only.
 * Still requires full checklist + OR_TOOLS_CANARY_STAGE (selected_trips first).
 */
export function isOrToolsAuthoritativeCanaryFlagOn(): boolean {
  const raw = process.env.OR_TOOLS_AUTHORITATIVE_CANARY?.trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}
