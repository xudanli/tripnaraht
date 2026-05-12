/**
 * Self-healing itinerary runtime — shared types
 */

export interface HealingState {
  readonly status: 'STABLE' | 'UNSTABLE' | 'RECOVERING';
  readonly iteration: number;
  readonly remainingIssues: number;
}

/** 挂在 UnifiedExecutionSemanticView 上的自愈快照（与 lineage / SELF_HEALING_STATE 对齐） */
export interface HealingRuntimeSnapshot extends HealingState {
  readonly stabilityScore?: number;
}
