/**
 * MEMORY_LIFECYCLE — Candidate 与 Production 不得混淆。
 *
 * CANDIDATE 永远不能进入 Decision Context（Runtime 硬约束）。
 */

export type MemoryLifecycleState =
  | 'OBSERVED'
  | 'CANDIDATE'
  | 'QUALIFIED'
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'RETIRED';

export const MEMORY_LIFECYCLE_ORDER: readonly MemoryLifecycleState[] = [
  'OBSERVED',
  'CANDIDATE',
  'QUALIFIED',
  'ACTIVE',
  'SUPERSEDED',
  'RETIRED',
] as const;

/**
 * 是否影响决策上下文。
 * QUALIFIED = Shadow（可观测对比，不进生产 Decision Context）
 * ACTIVE = 唯一可进生产 Decision Context 的记忆态
 */
export function memoryLifecycleAffectsDecision(
  state: MemoryLifecycleState,
): boolean {
  return state === 'ACTIVE';
}

export function memoryLifecycleIsShadowOnly(
  state: MemoryLifecycleState,
): boolean {
  return state === 'QUALIFIED';
}

/** Event status → Lifecycle（投影） */
export function lifecycleFromEventStatus(
  status: string,
): MemoryLifecycleState {
  if (status === 'ACTIVE') return 'ACTIVE';
  if (status === 'CANDIDATE' || status === 'INFERRED') return 'CANDIDATE';
  if (status === 'SUPERSEDED') return 'SUPERSEDED';
  if (status === 'INVALIDATED' || status === 'REDACTED') return 'RETIRED';
  return 'OBSERVED';
}

export const MEMORY_LIFECYCLE_TABLE: ReadonlyArray<{
  state: MemoryLifecycleState;
  meaning: string;
  affectsDecision: boolean;
}> = [
  { state: 'OBSERVED', meaning: '观察到信号', affectsDecision: false },
  { state: 'CANDIDATE', meaning: '可能规律', affectsDecision: false },
  { state: 'QUALIFIED', meaning: '证据充分（Shadow）', affectsDecision: false },
  { state: 'ACTIVE', meaning: '正式记忆', affectsDecision: true },
  { state: 'SUPERSEDED', meaning: '被新证据替代', affectsDecision: false },
  { state: 'RETIRED', meaning: '失效', affectsDecision: false },
];
