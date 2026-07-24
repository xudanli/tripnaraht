import {
  EXPERIENCE_FLOW_RESEARCH_KEY,
  projectExperienceFlowFromTraceSignals,
} from '../../../trips/decision/models/experience-flow.model';
import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from './emotional-resonance.constants';
import type { ResearchConflictNegotiationReport } from '../../teams/research/research-conflict-negotiation.types';
import type { UserEmotionalAccount } from './user-emotional-account.types';

/** 6.x：Member / Skill 执行层的稳健偏好（与 5.0.1 `austerityMode` 可叠加） */
export type ResearchStabilityMode = 'BALANCED' | 'STABILITY_FIRST';

/** 写入 `research_data` 的可观测 trace（与 TD-05 `traceSignals` / `DecisionLogMetadataPrd` 语义对齐）。 */
export const RESEARCH_TRACE_SIGNALS_KEY = '__research_trace_signals' as const;

export type ResearchTraceSignalsV1 = {
  schemaVersion: 'research-trace-signals/v1';
  frustration_circuit_triggered: boolean;
  stability_mode_active: boolean;
  narrative_track: 'EMPATHY_RECOVERY' | 'EXPERIENCE_FIRST';
  /** 审计：计算 `frustration_circuit_triggered` 时使用的阈值快照 */
  frustration_threshold: number;
};

type NegotiationTraceSlice = Pick<
  ResearchConflictNegotiationReport,
  'user_emotional_account' | 'mental_offset_hints'
>;

/**
 * 由 EBP 协商报告推导研究轨 trace（纯函数，无 IO）。
 * - `frustration_circuit_triggered`：挫败分 ≥ 阈值，或 `mental_offset_hints.frustration_circuit_active`（含实时重跑熔断）。
 * - `stability_mode_active`：与 Member 层 `shouldEnableStabilityMode` / 熔断提示一致（收窄 Skill 面）。
 * - `narrative_track`：熔断 ON → `EMPATHY_RECOVERY`，否则 `EXPERIENCE_FIRST`。
 */
export function computeResearchTraceSignalsFromNegotiation(
  report: NegotiationTraceSlice | undefined,
): ResearchTraceSignalsV1 {
  const acct = report?.user_emotional_account;
  const fromScore = (acct?.frustration_score ?? 0) >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;
  const fromHint = report?.mental_offset_hints?.frustration_circuit_active === true;
  const frustration_circuit_triggered = fromScore || fromHint;
  const stability_mode_active = frustration_circuit_triggered || shouldEnableStabilityMode(acct);
  const narrative_track: 'EMPATHY_RECOVERY' | 'EXPERIENCE_FIRST' = frustration_circuit_triggered
    ? 'EMPATHY_RECOVERY'
    : 'EXPERIENCE_FIRST';
  return {
    schemaVersion: 'research-trace-signals/v1',
    frustration_circuit_triggered,
    stability_mode_active,
    narrative_track,
    frustration_threshold: FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD,
  };
}

/**
 * 将 trace 信号幂等写入 `research_data`（Kernel / Narrator / 落库侧可读）。
 * 建议在 `__research_conflict_negotiation` 赋值之后立即调用。
 */
export function applyResearchTraceSignalsToResearchData(
  researchData: Record<string, unknown>,
  report: NegotiationTraceSlice | undefined,
): void {
  const trace = computeResearchTraceSignalsFromNegotiation(report);
  researchData[RESEARCH_TRACE_SIGNALS_KEY] = trace;
  researchData[EXPERIENCE_FLOW_RESEARCH_KEY] = projectExperienceFlowFromTraceSignals(trace);
}

/** @alias 见 {@link applyResearchTraceSignalsToResearchData}（挫败熔断命名） */
export const applyCircuitBreakerToMetadata = applyResearchTraceSignalsToResearchData;

/**
 * 高挫败感时启用稳健模式：收窄 Skill 面、抑制探索型 Gossip，与 `frustration_circuit_active` 阈值对齐。
 */
export function shouldEnableStabilityMode(account: UserEmotionalAccount | undefined): boolean {
  return (account?.frustration_score ?? 0) >= FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD;
}

export function resolveResearchStabilityMode(account: UserEmotionalAccount | undefined): ResearchStabilityMode {
  return shouldEnableStabilityMode(account) ? 'STABILITY_FIRST' : 'BALANCED';
}
