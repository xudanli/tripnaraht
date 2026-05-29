import type { VerificationIssue } from '../../decision/kernel/decision-state.types';
import type { GateResult, GateViolation } from '../interfaces/trip-plan.interface';
import { deriveGuardianPersonaVotes } from './guardian-persona-surface.util';

/** 与 `mergeVerificationIssuesIntoGateResult` 写入的 `GateViolation.detail` 前缀一致，用于 RE-VERIFY 时整组替换 */
export const VERIFY_SYNTHETIC_VIOLATION_PREFIX = '[VERIFY]';

function isVerificationIssue(x: unknown): x is VerificationIssue {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return typeof o.code === 'string' && typeof o.class === 'string' && typeof o.message === 'string';
}

function verificationIssueToGateViolation(issue: VerificationIssue): GateViolation {
  const cls = issue.class;
  const code = issue.code;
  let severity: GateViolation['severity'];
  let type: GateViolation['type'];

  if (cls === 'FATAL') {
    severity = 'HARD';
    type = 'SAFETY';
  } else if (cls === 'CONFLICT') {
    /** HARD：与 `deriveGuardianPersonaVotes` 对齐，强制 Abu REJECT；`verify_synthetic` 避免辩论 LLM 因「仅 VERIFY 合成 HARD」被短路 */
    severity = 'HARD';
    if (code === 'FATIGUE_HIGH' || code === 'FATIGUE_OVERLOAD') {
      type = 'FATIGUE';
    } else if (code === 'TIME_WINDOW_BREACH' || code === 'TIME_WINDOW_OVERLAP') {
      type = 'TIME_CONFLICT';
    } else if (code === 'POI_CLOSED') {
      type = 'DATA_MISSING';
    } else if (code === 'ROUTE_INFEASIBLE' || code === 'TERRAIN_F_ROAD_UNFIT') {
      type = 'SAFETY';
    } else {
      type = 'SAFETY';
    }
  } else {
    severity = 'SOFT';
    if (code === 'POI_CLOSED') type = 'DATA_MISSING';
    else if (code === 'FATIGUE_HIGH' || code === 'FATIGUE_OVERLOAD') type = 'FATIGUE';
    else if (code === 'SUNSET_BREACH') type = 'REACHABILITY';
    else if (code === 'WEATHER_RISK') type = 'SAFETY';
    else type = 'DATA_MISSING';
  }

  const entity = issue.entityRef?.id ? ` [entity:${issue.entityRef.type}:${issue.entityRef.id}]` : '';
  const detail = `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} ${code}${entity}: ${issue.message}`.slice(0, 4000);
  return { type, severity, detail, verify_synthetic: true };
}

function shouldPreserveLlmDebate(gate: GateResult): boolean {
  const gr = gate.guardian_results;
  return gr?.source === 'llm_debate' && gr.is_simulated === false;
}

/**
 * 将 Kernel VERIFY 的 `issues` 并入 `gate_result.violations`，并刷新 `guardian_results`（`violation_projection_v1`），
 * 除非当前已是非模拟的 `llm_debate` 输出（避免覆盖合议）。
 * 带前缀 `[VERIFY]` 的条目在每次合并前会先移除，便于后续「验证通过」时清空合成项。
 */
export function mergeVerificationIssuesIntoGateResult(
  gate: GateResult | undefined,
  issues: unknown[],
): GateResult | undefined {
  if (!gate) return undefined;
  const base = (gate.violations ?? []).filter(
    (v) => !String(v.detail ?? '').trimStart().startsWith(VERIFY_SYNTHETIC_VIOLATION_PREFIX),
  );
  const structured = (Array.isArray(issues) ? issues : []).filter(isVerificationIssue);
  const synthetic = structured.map(verificationIssueToGateViolation);
  const merged = [...base, ...synthetic];
  const stripped: GateResult = { ...gate, violations: merged };
  if (shouldPreserveLlmDebate(gate)) {
    return stripped;
  }
  return { ...stripped, guardian_results: deriveGuardianPersonaVotes(stripped) };
}
