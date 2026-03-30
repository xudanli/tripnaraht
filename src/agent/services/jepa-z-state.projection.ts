import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { LatentContractStateVector, Normalized01 } from '../interfaces/trip-plan.interface';

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

const normalize01Maybe = (n: unknown): number | null => {
  if (typeof n !== 'number' || Number.isNaN(n)) return null;
  // 约定：值域可能是 0..1 或 0..100
  return clamp01(n <= 1 ? n : n / 100);
};

const mapRiskLabelTo01 = (label?: string): number | null => {
  const l = (label ?? '').toUpperCase();
  if (l === 'LOW') return 0.2;
  if (l === 'MEDIUM') return 0.5;
  if (l === 'HIGH') return 0.8;
  if (l === 'CRITICAL') return 0.95;
  return null;
};

/**
 * JEPA latent_contract.z_state 投影：
 * - 与 AgentService.buildJePaPayload() 保持同口径（至少 continuity/risk_score/cost/fatigue/satisfaction_estimate）。
 * - 用于把“动作前/后”的真实状态快照写入 DecisionState.history。
 */
export function projectJepaZStateFromDecisionState(decisionState: DecisionState): LatentContractStateVector {
  const env = decisionState.environmentState;
  const trip = decisionState.tripState;
  const intent = decisionState.userIntent;
  const feedback = decisionState.feedback;
  const constraints = decisionState.constraints;

  // continuity：约束可行性近似
  const continuity01: Normalized01 =
    typeof constraints?.feasible === 'boolean' ? (constraints.feasible ? 0.9 : 0.2) : null;

  // risk_score：优先失败风险标签，否则使用 weatherRisk 的归一化值
  const weatherRisk01 = env?.weatherRisk !== undefined ? normalize01Maybe(env.weatherRisk) : null;
  const failureRisk01 = mapRiskLabelTo01(env?.failureRiskLevel);
  const riskScore01: Normalized01 = (failureRisk01 ?? weatherRisk01) ?? null;

  // cost：预算超支归一化
  const cost01: Normalized01 = trip?.budgetOverrun !== undefined ? normalize01Maybe(trip.budgetOverrun) : null;

  // fatigue：疲劳阈值归一化
  const fatigue01: Normalized01 = trip?.fatigue !== undefined ? normalize01Maybe(trip.fatigue) : null;

  // satisfaction_estimate：反馈满意度归一化（0..1）
  const rawSat = feedback?.satisfactionScore;
  const satisfactionEstimate01: Normalized01 =
    rawSat === undefined
      ? null
      : typeof rawSat === 'number'
        ? clamp01(rawSat <= 1 ? rawSat : rawSat / 5)
        : null;

  const missing_fields: string[] = [];
  if (continuity01 === null) missing_fields.push('continuity');
  if (riskScore01 === null) missing_fields.push('risk_score');
  if (cost01 === null) missing_fields.push('cost');
  if (fatigue01 === null) missing_fields.push('fatigue');
  if (satisfactionEstimate01 === null) missing_fields.push('satisfaction_estimate');

  // intent 目前未参与 z_state 投影，但保留变量以便未来扩展（例如 delay/fatigue 映射校准）
  void intent;

  return {
    continuity: continuity01,
    risk_score: riskScore01,
    cost: cost01,
    fatigue: fatigue01,
    satisfaction_estimate: satisfactionEstimate01,
    missing_fields,
    fill_strategy: 'NULL',
  };
}

