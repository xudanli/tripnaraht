/**
 * P0-4：权威写回走廊审计矩阵（代码 SSOT 脚手架）。
 * 分走廊实现细节以各 Apply Service 为准；本表供契约测试与审查引用。
 */

export const WRITEBACK_CORRIDOR_AUDIT_MATRIX_VERSION = '1.0.0' as const;

export type WritebackPersistenceTarget =
  | 'none'
  | 'trip_itinerary_item'
  | 'plan_version'
  | 'effective_plan'
  | 'side_effect'
  | 'mixed';

export type WritebackAutoPolicy = 'never' | 'narrow_corridor' | 'policy_controlled';

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
};

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
    notes: 'Kernel VERIFY is not the sole authority for all corridors',
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
    notes: 'Side-effect rules apply',
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
    notes: 'Independent of route_and_run GATE_EVAL node',
  },
] as const;
