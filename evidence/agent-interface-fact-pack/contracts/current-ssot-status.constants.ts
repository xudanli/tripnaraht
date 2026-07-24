/**
 * P0-2：TravelContext 尚未成为 Claude SM 主链 SSOT。
 * 本文件仅冻结「当前 / 目标」口径；贯通迁移不在本轮范围。
 */

export const TRAVEL_CONTEXT_SSOT_STATUS_VERSION = '1.0.0' as const;

/** 当前运行态：OrchestratorState ∥ DecisionState(DSO) 双轨 */
export const CURRENT_RUNTIME_SSOT = 'OrchestratorState + DecisionState/DSO' as const;

/** 目标上下文 SSOT：RFC-003 TravelContext */
export const TARGET_CONTEXT_SSOT = 'TravelContext (RFC-003)' as const;

export type TravelContextMigrationRow = {
  data: string;
  currentSource: string;
  targetSource: string;
};

export const TRAVEL_CONTEXT_MIGRATION_TABLE: readonly TravelContextMigrationRow[] = [
  {
    data: 'Trip binding',
    currentSource: 'OrchestratorState.metadata / request.trip_id',
    targetSource: 'TravelContextIdentity.tripId',
  },
  {
    data: 'Effective Plan',
    currentSource: 'plan_version (number) / planVersionId (string, multi-corridor)',
    targetSource: 'TravelContextBindings.effectivePlanVersionId',
  },
  {
    data: 'Research snapshot',
    currentSource: 'conversation_id + DSO / research_data',
    targetSource: 'TravelContext evidence snapshot',
  },
  {
    data: 'Team constraints',
    currentSource: 'research metadata / emergency_constraints',
    targetSource: 'TravelContext constraints',
  },
  {
    data: 'Page context',
    currentSource: 'client meta / conversation_context',
    targetSource: 'PageAIContract / TravelContext',
  },
] as const;
