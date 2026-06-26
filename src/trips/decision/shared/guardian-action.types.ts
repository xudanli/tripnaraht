/**
 * 三人格责任席位 — 统一决策动作（用户可见契约）
 *
 * BLOCK  → Abu（阻止执行）
 * ADJUST → Dr.Dre（节奏/代价调整）
 * REPAIR → Neptune（意图守恒修复）
 * CHOOSE → 用户（软约束价值取舍）
 */

export type GuardianAction = 'BLOCK' | 'ADJUST' | 'REPAIR' | 'CHOOSE';

/** Abu 存在性判断状态 */
export type AbuExistenceStatus =
  | 'PASS'
  | 'WARN'
  | 'REQUIRE_CONFIRMATION'
  | 'BLOCK'
  | 'UNKNOWN';

/** Dr.Dre 代价判断状态 */
export type DreCostStatus =
  | 'COMFORTABLE'
  | 'BALANCED'
  | 'STRETCHED'
  | 'OVERLOADED'
  | 'TEAM_CONFLICT';

export type LegacyPersonaVerdict =
  | 'ALLOW'
  | 'ADJUST'
  | 'REPLACE'
  | 'REJECT'
  | 'NEED_CONFIRM';

export type LegacyDecisionAction =
  | 'ALLOW'
  | 'REJECT'
  | 'ADJUST'
  | 'REPLACE'
  | 'EVALUATE'
  | 'MODIFY';

const PERSONA_DEFAULT_ACTION: Record<'ABU' | 'DR_DRE' | 'NEPTUNE', GuardianAction> = {
  ABU: 'BLOCK',
  DR_DRE: 'ADJUST',
  NEPTUNE: 'REPAIR',
};

/**
 * 将人格外壳 verdict 映射为责任动作（CHOOSE 仅用于用户确认点）
 */
export function mapPersonaVerdictToGuardianAction(
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
  verdict: LegacyPersonaVerdict,
): GuardianAction | null {
  if (verdict === 'ALLOW') return null;
  if (verdict === 'NEED_CONFIRM') return 'CHOOSE';
  if (verdict === 'REJECT') return persona === 'ABU' ? 'BLOCK' : PERSONA_DEFAULT_ACTION[persona];
  if (verdict === 'ADJUST') return 'ADJUST';
  if (verdict === 'REPLACE') return 'REPAIR';
  return PERSONA_DEFAULT_ACTION[persona];
}

export function mapDecisionActionToGuardianAction(
  persona: 'ABU' | 'DR_DRE' | 'NEPTUNE',
  action: LegacyDecisionAction,
): GuardianAction | null {
  if (action === 'ALLOW' || action === 'EVALUATE') return null;
  if (action === 'REJECT') return persona === 'ABU' ? 'BLOCK' : 'ADJUST';
  if (action === 'ADJUST') return 'ADJUST';
  if (action === 'REPLACE' || action === 'MODIFY') return 'REPAIR';
  return null;
}

export function mapAbuGateToExistenceStatus(
  gateStatus: 'ALLOW' | 'REJECT' | 'NEED_CONFIRM' | 'SUGGEST_REPLACE' | string | undefined,
  hasHardBlock: boolean,
): AbuExistenceStatus {
  if (hasHardBlock || gateStatus === 'REJECT') return 'BLOCK';
  if (gateStatus === 'NEED_CONFIRM') return 'REQUIRE_CONFIRMATION';
  if (gateStatus === 'SUGGEST_REPLACE') return 'WARN';
  if (gateStatus === 'ALLOW') return 'PASS';
  return 'UNKNOWN';
}

export function mapFatigueToDreCostStatus(fatigueScore: number | undefined): DreCostStatus {
  if (fatigueScore == null) return 'BALANCED';
  if (fatigueScore > 85) return 'OVERLOADED';
  if (fatigueScore > 70) return 'STRETCHED';
  if (fatigueScore > 50) return 'BALANCED';
  return 'COMFORTABLE';
}
