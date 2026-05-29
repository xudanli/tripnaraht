/**
 * PR-C：CONDITIONAL_REPAIR / REPAIR 步序 → Alpaca & ShareGPT SFT 纠错链样本。
 */

import type {
  DecisionTrajectoryETLRow,
  SftRepairChainRecord,
} from '../interfaces/decision-trajectory-etl.types';
import type { DecisionTrajectoryV1 } from '../interfaces/decision-trajectory.types';
import { DECISION_TRAJECTORY_SCHEMA_ID } from '../interfaces/decision-trajectory.types';
import { serializePlannerPrompt } from '../dpo/dpo-preference-extractor.util';
import { buildPlannerRejectedSurrogate } from '../dpo/dpo-preference-extractor.util';

const REPAIR_INSTRUCTION_ZH =
  '你是 TripNARA 规划修复模块。根据门控违规与系统修复提示，在保留用户硬约束的前提下输出修正后的可执行行程 JSON。';

function clampStr(s: unknown, max = 16000): string {
  const t = typeof s === 'string' ? s : JSON.stringify(s ?? '');
  return t.length <= max ? t : `${t.slice(0, max)}…[truncated]`;
}

export function isRepairChainCandidate(row: DecisionTrajectoryETLRow): boolean {
  if (row.status !== 'FINALIZED') return false;
  if (row.orchestrationOutcome === 'CONDITIONAL_REPAIR') return true;
  return (row.payload.orchestration_steps ?? []).some((s) => s.step === 'REPAIR');
}

function collectRepairStepNames(payload: DecisionTrajectoryV1): string[] {
  return (payload.orchestration_steps ?? [])
    .filter((s) => s.step === 'VERIFY' || s.step === 'REPAIR' || s.status === 'FAILED')
    .map((s) => `${s.step}:${s.status}`);
}

function buildRepairThoughtChain(payload: DecisionTrajectoryV1): string {
  const defect = buildPlannerRejectedSurrogate(payload);
  const axiomIds = payload.axiom_gate.triggered_axiom_ids ?? [];
  const violationCodes =
    payload.axiom_gate.violations
      ?.map((v) => (v as { type?: string }).type)
      .filter(Boolean)
      .slice(0, 8) ?? [];

  const repairSteps = collectRepairStepNames(payload);
  const harnessRepair = (payload.harness_trace?.step_spans ?? []).filter(
    (s) => s.run_status && s.run_status !== 'PASSED',
  );

  const lines = [
    '## 初始错误方案（门控投影）',
    defect ?? '(无结构化缺陷代理；见 orchestration_steps)',
    '',
    '## 触发违规 / 公理',
    clampStr({ axiom_ids: axiomIds, violation_types: violationCodes }),
    '',
    '## 编排修复链（VERIFY → REPAIR）',
    repairSteps.join(' → ') || 'REPAIR',
  ];

  if (harnessRepair.length) {
    lines.push('', '## Harness 失败步', clampStr(harnessRepair));
  }

  if (payload.debate_history?.guardian_votes_redacted?.abu?.vote === 'BLOCK') {
    lines.push(
      '',
      '## Abu 安全闸',
      payload.debate_history.guardian_votes_redacted.abu.reason,
    );
  }

  lines.push(
    '',
    '## 系统 Repair 提示',
    '根据 required_adjustments 与 VERIFY 失败项最小改动修复；不得违反 hard_constraints。',
  );

  return lines.join('\n');
}

function buildFinalItineraryOutput(payload: DecisionTrajectoryV1): string | null {
  const it = payload.final_output?.itinerary;
  if (!it?.days?.length) return null;
  return clampStr(it);
}

/**
 * 单条轨迹编译为 Alpaca + ShareGPT 两条逻辑记录（同一内容，不同格式）。
 */
export function compileSftRepairChains(row: DecisionTrajectoryETLRow): SftRepairChainRecord[] {
  if (!isRepairChainCandidate(row)) return [];
  const payload = row.payload;
  if (payload.schema_id !== DECISION_TRAJECTORY_SCHEMA_ID) return [];

  const finalItinerary = buildFinalItineraryOutput(payload);
  if (!finalItinerary) return [];

  const userContext = serializePlannerPrompt(payload.input_context);
  const thought = buildRepairThoughtChain(payload);
  const input = `${userContext}\n\n---\n\n${thought}`;
  const output = `${thought}\n\n---\n\n## 最终合规方案\n${finalItinerary}`;

  const meta = {
    orchestration_outcome: row.orchestrationOutcome,
    repair_steps: collectRepairStepNames(payload),
    triggered_axiom_ids: payload.axiom_gate.triggered_axiom_ids,
  };

  const alpaca: SftRepairChainRecord = {
    request_id: row.requestId,
    trajectory_id: row.id,
    format: 'alpaca',
    instruction: REPAIR_INSTRUCTION_ZH,
    input,
    output,
    metadata: meta,
  };

  const sharegpt: SftRepairChainRecord = {
    request_id: row.requestId,
    trajectory_id: row.id,
    format: 'sharegpt',
    instruction: REPAIR_INSTRUCTION_ZH,
    input,
    output,
    conversations: [
      { from: 'human', value: input },
      { from: 'gpt', value: thought },
      { from: 'gpt', value: finalItinerary },
    ],
    metadata: meta,
  };

  return [alpaca, sharegpt];
}

export function compileAllSftRepairChains(rows: DecisionTrajectoryETLRow[]): SftRepairChainRecord[] {
  const out: SftRepairChainRecord[] = [];
  for (const row of rows) {
    out.push(...compileSftRepairChains(row));
  }
  return out;
}
