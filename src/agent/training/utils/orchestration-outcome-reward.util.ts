import type { DecisionLogEntry, GateResult, Itinerary } from '../../interfaces/trip-plan.interface';
import type {
  DecisionTrajectoryV1,
  OrchestrationOutcomeKind,
} from '../interfaces/decision-trajectory.types';
import type { RewardSignal } from '../interfaces/trajectory.interface';

export type OrchestrationOutcomeRewardResult = {
  outcome: OrchestrationOutcomeKind;
  totalReward: number;
  trainable: boolean;
  signals: RewardSignal[];
};

function stepsFromLog(log?: DecisionLogEntry[]): string[] {
  return (log ?? []).map((e) => String(e.step ?? ''));
}

function hasHardViolation(gate?: GateResult | DecisionTrajectoryV1['axiom_gate']): boolean {
  const violations = (gate as GateResult)?.violations ?? [];
  return violations.some((v) => String((v as { severity?: string }).severity).toUpperCase() === 'HARD');
}

function gateBlocked(gate?: { gate_result?: string }): boolean {
  return String(gate?.gate_result ?? '').toUpperCase() === 'BLOCK';
}

function planAfterBlock(log: DecisionLogEntry[]): boolean {
  const steps = stepsFromLog(log);
  const blockIdx = steps.findIndex((s) => s === 'GATE_EVAL');
  if (blockIdx < 0) return false;
  return steps.slice(blockIdx + 1).some((s) => s === 'PLAN_GEN' || s === 'REPAIR');
}

function detectOutcome(payload: DecisionTrajectoryV1, log: DecisionLogEntry[]): OrchestrationOutcomeKind {
  const gate = payload.axiom_gate;
  const finalGate = payload.final_output?.gate_result;
  const blocked = gateBlocked(gate) || gateBlocked(finalGate);

  if (blocked && (payload.final_output?.itinerary || planAfterBlock(log))) {
    return 'CRITICAL_FAIL';
  }

  const steps = stepsFromLog(log);
  const hadRepair = steps.includes('REPAIR');
  const verifyRetry =
    (payload.harness_trace_export_path ?? '').length > 0 &&
    steps.filter((s) => s === 'VERIFY').length > 1;

  if (
    hadRepair &&
    !gateBlocked(finalGate ?? gate) &&
    (finalGate?.gate_result === 'ALLOW' || finalGate?.gate_result === 'ADJUST_REQUIRED' || !finalGate)
  ) {
    return 'CONDITIONAL_REPAIR';
  }

  if (verifyRetry && !gateBlocked(finalGate ?? gate)) {
    return 'CONDITIONAL_REPAIR';
  }

  const debate = payload.debate_history;
  const tieBreak =
    debate?.tie_break_used === true ||
    Boolean(debate?.debate_gate_fusion?.includes('tie'));
  const safetyOk = !blocked && !hasHardViolation(finalGate ?? (gate as unknown as GateResult));

  if (
    safetyOk &&
    !tieBreak &&
    (debate?.guardian_votes_redacted || !debate) &&
    steps.includes('PLAN_GEN') &&
    !hadRepair
  ) {
    return 'GOLDEN';
  }

  return 'INCONCLUSIVE';
}

/**
 * 编排语义 Reward（纯规则，无 LLM Judge）。PR-C 可在此文件扩展细粒度规则。
 */
export function computeOrchestrationOutcomeReward(
  payload: DecisionTrajectoryV1,
  decisionLog: DecisionLogEntry[] = [],
): OrchestrationOutcomeRewardResult {
  const outcome = detectOutcome(payload, decisionLog);
  const ts = new Date().toISOString();
  const signals: RewardSignal[] = [];

  switch (outcome) {
    case 'CRITICAL_FAIL':
      signals.push({
        type: 'GATE_FAIL',
        value: -1.0,
        timestamp: ts,
        metadata: { orchestration_outcome: outcome, planner_gate_disobedience: true, is_gate_signal: true },
      });
      return { outcome, totalReward: -1.0, trainable: false, signals };
    case 'CONDITIONAL_REPAIR':
      signals.push({
        type: 'FEASIBILITY_PASS',
        value: 0.5,
        timestamp: ts,
        metadata: { orchestration_outcome: outcome, repair_chain: true },
      });
      return { outcome, totalReward: 0.5, trainable: true, signals };
    case 'GOLDEN':
      signals.push(
        {
          type: 'SAFETY_PASS',
          value: 0.3,
          timestamp: ts,
          metadata: { orchestration_outcome: outcome, is_gate_signal: true },
        },
        {
          type: 'GATE_PASS',
          value: 1.0,
          timestamp: ts,
          metadata: { orchestration_outcome: outcome, golden_path: true, is_gate_signal: true },
        },
      );
      return { outcome, totalReward: 1.0, trainable: true, signals };
    default:
      signals.push({
        type: 'GATE_PASS',
        value: 0,
        timestamp: ts,
        metadata: { orchestration_outcome: outcome, is_gate_signal: true },
      });
      return { outcome, totalReward: 0, trainable: false, signals };
  }
}

/** 从 itinerary + gate 粗检 BLOCK 后是否仍输出可执行路线（Critical Fail 辅助）。 */
export function itineraryPresentAfterBlock(
  gate: DecisionTrajectoryV1['axiom_gate'],
  itinerary?: Itinerary,
): boolean {
  return gateBlocked(gate) && Boolean(itinerary?.days?.length);
}
