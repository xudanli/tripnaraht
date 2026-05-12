/**
 * Replan / previous-world (PRD I3): fold client-supplied lineage into TripRun.metadata for audit.
 */

export type TripRunReplanLineageInput = {
  previous_plan_version?: number;
  previous_world_snapshot_hash?: string;
};

/** New orchestration plan_version after replan: max(1, previous_plan_version + 1), or 1 if no previous. */
export function resolveOrchestratorPlanVersionAfterReplan(
  options?: TripRunReplanLineageInput | null,
): number {
  const prev = options?.previous_plan_version;
  if (prev !== undefined && Number.isFinite(prev)) {
    return Math.max(1, Number(prev) + 1);
  }
  return 1;
}

/**
 * When replan fields are present, returns metadata extended with `replan_context`.
 */
export function mergeReplanLineageIntoTripRunMetadata(
  base: Record<string, unknown>,
  lineage?: TripRunReplanLineageInput | null,
): Record<string, unknown> {
  if (!lineage) return base;
  const rc: Record<string, unknown> = {};
  if (lineage.previous_plan_version !== undefined && Number.isFinite(lineage.previous_plan_version)) {
    rc.previous_plan_version = lineage.previous_plan_version;
  }
  const h =
    typeof lineage.previous_world_snapshot_hash === 'string'
      ? lineage.previous_world_snapshot_hash.trim()
      : '';
  if (h) rc.previous_world_snapshot_hash = h;
  if (Object.keys(rc).length === 0) return base;
  return { ...base, replan_context: rc };
}
