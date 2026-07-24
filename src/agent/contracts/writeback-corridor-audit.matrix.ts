/**
 * P0-4 / WB-1：权威写回走廊审计矩阵（代码 SSOT 脚手架）。
 * 分走廊实现细节以各 Apply Service 为准；本表供契约测试与审查引用。
 *
 * WB-1：`persistence: 'mixed'` 走廊必须挂 `mixedTargets` 清单（C022b/c）。
 * 禁止把各目标统一进单一 store / 伪 SSOT。
 */

export const WRITEBACK_CORRIDOR_AUDIT_MATRIX_VERSION = '1.1.0' as const;

/** Product/engineering must not collapse corridor writers into one persistence surface. */
export const MIXED_WRITE_UNIFICATION_FORBIDDEN =
  'Do not unify mixed write targets into a single store or global writeback bus' as const;

export type WritebackPersistenceTarget =
  | 'none'
  | 'trip_itinerary_item'
  | 'plan_version'
  | 'effective_plan'
  | 'side_effect'
  | 'mixed';

export type WritebackAutoPolicy = 'never' | 'narrow_corridor' | 'policy_controlled';

/** Concrete writer under a `persistence: 'mixed'` corridor (EWP-02 / C022b / C022c). */
export type MixedWriteTargetDescriptor = {
  id: string;
  /** What is written */
  target: string;
  /** Repo-relative path of the writer */
  path: string;
  /** Symbol / call site hint */
  symbol: string;
  /** always | flag_gated | optional | in_memory | response_only */
  durability: 'always' | 'flag_gated' | 'optional' | 'in_memory' | 'response_only';
  notes?: string;
};

export type WritebackCorridorAuditRow = {
  id: string;
  entry: string;
  productSurface: string;
  preVerify: string;
  confirm: string;
  freshnessGuard: string;
  idempotency: string;
  persistence: WritebackPersistenceTarget;
  auto: WritebackAutoPolicy;
  notes: string;
  /**
   * Required when persistence === 'mixed' for Unified/Actions (WB-1).
   * Other mixed rows may omit until a dedicated EWP decomposes them.
   */
  mixedTargets?: readonly MixedWriteTargetDescriptor[];
};

/** C022b — Unified Execute concrete writers (plan-version-apply.executor). */
export const UNIFIED_EXECUTE_MIXED_TARGETS: readonly MixedWriteTargetDescriptor[] = [
  {
    id: 'plan_version_set_effective',
    target: 'PlanVersion effective pointer',
    path: 'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    symbol: 'planVersionStore.setEffective',
    durability: 'always',
  },
  {
    id: 'plan_version_record_execution',
    target: 'PlanVersion execution record / idempotency',
    path: 'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    symbol: 'planVersionStore.recordExecution',
    durability: 'always',
  },
  {
    id: 'decision_ledger_upsert',
    target: 'Decision ledger → EFFECTIVE',
    path: 'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    symbol: 'ledgerStore.upsertDecision',
    durability: 'always',
  },
  {
    id: 'problem_store_upsert',
    target: 'Problem store → RESOLVED',
    path: 'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    symbol: 'problemStore.upsert',
    durability: 'always',
  },
  {
    id: 'itinerary_materializer',
    target: 'ItineraryItem via materializer',
    path: 'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    symbol: 'itineraryMaterializer.applyPlanOperations',
    durability: 'flag_gated',
    notes: 'Call site present; not always-on',
  },
  {
    id: 'trip_revision_markers',
    target: 'Trip.metadata revision / applied markers',
    path: 'src/trips/guardian-decision-core/execution/plan-version-apply.executor.ts',
    symbol: 'bumpTripRevisionAndAppliedMarkers',
    durability: 'always',
  },
] as const;

/** C022c — Actions Commit concrete writers (action-execution.service). */
export const ACTIONS_COMMIT_MIXED_TARGETS: readonly MixedWriteTargetDescriptor[] = [
  {
    id: 'action_registry_handlers',
    target: 'Per-action handler DB writes',
    path: 'src/agent/services/action-execution.service.ts',
    symbol: 'actionRegistry.get / handler execute',
    durability: 'always',
    notes: 'Exact tables depend on registered action; not enumerated here',
  },
  {
    id: 'agent_action_log',
    target: 'Prisma agentActionLog saga log',
    path: 'src/agent/services/action-execution.service.ts',
    symbol: 'agentActionLog.createInit / updateStatus',
    durability: 'optional',
    notes: 'Optional DI; when present durable',
  },
  {
    id: 'side_effect_registry',
    target: 'Side-effect registry applies (holds / financial / locks)',
    path: 'src/agent/services/action-execution.service.ts',
    symbol: 'sideEffectRegistry.applyMany',
    durability: 'optional',
  },
  {
    id: 'physical_validation_snapshot',
    target: 'Trip.metadata physical validation snapshot',
    path: 'src/agent/services/action-execution.service.ts',
    symbol: 'persistPhysicalValidationSnapshot',
    durability: 'optional',
  },
  {
    id: 'ontology_response_extension',
    target: 'Response ontology patch',
    path: 'src/agent/services/action-execution.service.ts',
    symbol: 'buildTravelOntologyCommitExtension',
    durability: 'response_only',
    notes: 'Not authoritative DB by itself',
  },
  {
    id: 'request_dedup_cache',
    target: 'In-memory idempotency dedup cache',
    path: 'src/agent/services/action-execution.service.ts',
    symbol: 'RequestDeduplicationService',
    durability: 'in_memory',
    notes: 'Not durable across instances',
  },
] as const;

export const WRITEBACK_CORRIDOR_AUDIT_MATRIX: readonly WritebackCorridorAuditRow[] = [
  {
    id: 'iceland_apply',
    entry: 'POST /iceland-self-drive/trips/:tripId/initial-plan/proposals/:proposalId/apply',
    productSurface: 'Iceland',
    preVerify: 'corridor verification / proposal status',
    confirm: 'required (confirm opens apply)',
    freshnessGuard: 'proposal status',
    idempotency: 'Idempotency-Key',
    persistence: 'plan_version',
    auto: 'never',
    notes: 'Also writes Trip/ItineraryItem; not OR-Tools',
  },
  {
    id: 'arrange_apply',
    entry: 'POST /trips/:tripId/arrange-itinerary/proposals/:proposalId/apply',
    productSurface: 'Arrange',
    preVerify: 'proposal validation / write guard; never ortoolsShadow.shadowChanges',
    confirm: 'explicit apply',
    freshnessGuard: 'proposal / contextVersion',
    idempotency: 'corridor-specific',
    persistence: 'plan_version',
    auto: 'never',
    notes: 'ADR-008 S4 shadow forbidden on apply',
  },
  {
    id: 'unified_execute',
    entry: 'POST /trips/:tripId/decisions/:decisionId/execute',
    productSurface: 'Unified Decision',
    preVerify: 'Unified Assessment',
    confirm: 'authorize then execute',
    freshnessGuard: 'decision revision',
    idempotency: 'corridor-specific',
    persistence: 'mixed',
    auto: 'policy_controlled',
    notes:
      'C022b: mixedTargets lists PlanVersion/ledger/problem/materializer/trip markers. Kernel VERIFY is not the sole authority for all corridors. ' +
      MIXED_WRITE_UNIFICATION_FORBIDDEN,
    mixedTargets: UNIFIED_EXECUTE_MIXED_TARGETS,
  },
  {
    id: 'actions_commit',
    entry: 'POST /agent/actions/commit',
    productSurface: 'Agent Actions',
    preVerify: 'preview',
    confirm: 'commit',
    freshnessGuard: 'action plan',
    idempotency: 'idempotency_key',
    persistence: 'mixed',
    auto: 'policy_controlled',
    notes:
      'C022c: mixedTargets lists actionRegistry/agentActionLog/sideEffects/dedup. Side-effect rules apply. ' +
      MIXED_WRITE_UNIFICATION_FORBIDDEN,
    mixedTargets: ACTIONS_COMMIT_MIXED_TARGETS,
  },
  {
    id: 'itinerary_adjust_apply',
    entry: 'POST /agent/route_and_run (+ apply_itinerary_adjust_draft / AUTO corridor)',
    productSurface: 'Main Agent',
    preVerify: 'main-chain Kernel VERIFY (advice segment)',
    confirm: 'utterance / apply flag',
    freshnessGuard: 'bound trip + pending draft',
    idempotency: 'request_id',
    persistence: 'trip_itinerary_item',
    auto: 'narrow_corridor',
    notes: 'P0-1: FLAWED_DRAFT blocks AUTO/SEMI_AUTO',
  },
  {
    id: 'mobile_verified_apply',
    entry: 'POST /mobile/trips/:tripId/... verified proposal apply',
    productSurface: 'Mobile',
    preVerify: 'Verification Snapshot',
    confirm: 'explicit mobile action',
    freshnessGuard: 'snapshot freshness',
    idempotency: 'corridor-specific',
    persistence: 'mixed',
    auto: 'never',
    notes:
      'Independent of route_and_run GATE_EVAL node. mixedTargets not yet decomposed (needs dedicated EWP); do not invent a single write table.',
  },
] as const;
