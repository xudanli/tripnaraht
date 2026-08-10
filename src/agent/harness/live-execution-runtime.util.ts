/**
 * Live Execution Runtime — Sprint 4 骨架。
 * Location/Time/Delay/Weather/Road/Risk → 结论 + 截止时间 + 备选 + Evidence。
 * MUST NOT：无确认改全行程；无 Evidence 的强结论。
 */

import type { AgentTaskContractV1 } from './agent-task-contract.types';
import { assertCapability, isCapabilityAllowed } from './assert-task-capability.util';
import {
  liveEvidenceHasLiveWeatherOrRoad,
  liveEvidenceImpliesHardBlock,
} from './collect-live-sensor-evidence.util';
import {
  enforceConclusionAgainstEvidence,
  normalizeEvidenceFreshness,
  type EvidenceFactV1,
} from './hardening/evidence.contract';

export const LIVE_EXECUTION_CONCLUSION_SCHEMA = 'nara.live_execution_conclusion.v1' as const;

export type LiveExecutionVerdict = 'YES' | 'NO' | 'CONDITIONAL';

export type LiveExecutionPhase =
  | 'INTAKE'
  | 'CONTEXT'
  | 'EVIDENCE'
  | 'JUDGE'
  | 'ALTERNATIVES'
  | 'DONE';

export type LiveEvidenceFactV1 = {
  key: string;
  valueZh: string;
  freshness: 'LIVE' | 'STALE' | 'UNKNOWN' | 'ASSUMED';
  source?: string;
};

export type LiveExecutionConclusionV1 = {
  schemaId: typeof LIVE_EXECUTION_CONCLUSION_SCHEMA;
  version: 1;
  conclusionId: string;
  tripId?: string;
  taskId: string;
  questionZh: string;
  verdict: LiveExecutionVerdict;
  conclusionZh: string;
  /** 最晚可出发/到达的本地时间提示 */
  deadlineZh?: string;
  alternativesZh: string[];
  evidence: LiveEvidenceFactV1[];
  /** 禁止静默改全行程 */
  applyPlanAllowed: false;
  requiresStrongConfirmationToMutate: true;
};

export type LiveExecutionPipelineResultV1 = {
  conclusion: LiveExecutionConclusionV1;
  phasesCompleted: LiveExecutionPhase[];
};

export function assertLiveExecutionEntry(contract: AgentTaskContractV1): {
  taskId: string;
  denyPlan: boolean;
} {
  if (contract.taskType !== 'LIVE_EXECUTION') {
    throw new Error(`[LiveRuntime] expected LIVE_EXECUTION, got ${contract.taskType}`);
  }
  const ans = assertCapability(contract, 'ANSWER');
  if (ans.ok === false) throw new Error(`[LiveRuntime] ${ans.reason}`);
  if (isCapabilityAllowed(contract, 'PLAN') || isCapabilityAllowed(contract, 'APPLY')) {
    throw new Error('[LiveRuntime] PLAN/APPLY forbidden in Live Execution Runtime');
  }
  return {
    taskId: contract.taskId,
    denyPlan: contract.capabilities.deny.includes('PLAN'),
  };
}

export function parseDelayHoursFromMessage(message: string): number | null {
  const m = String(message ?? '');
  const digit = m.match(
    /晚(?:了)?\s*(\d+(?:\.\d+)?)\s*个?小时|延误\s*(\d+(?:\.\d+)?)\s*个?小时|晚\s*(\d+(?:\.\d+)?)\s*个?小时/,
  );
  if (digit) {
    const n = Number(digit[1] ?? digit[2] ?? digit[3]);
    if (Number.isFinite(n) && n > 0 && n <= 24) return n;
  }
  const cn: Record<string, number> = {
    半: 0.5,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
  };
  const cnHit = m.match(/晚(?:了)?\s*([半一两二三四五六])\s*个?小时/);
  if (cnHit && cn[cnHit[1]] != null) return cn[cnHit[1]];
  return null;
}

export function detectLiveDestinationHint(message: string): string | undefined {
  const m = String(message ?? '');
  if (/冰河湖|Jökulsárlón|Jokulsarlon|冰川湖/i.test(m)) return '冰河湖';
  if (/蓝湖|Blue\s*Lagoon/i.test(m)) return '蓝湖';
  if (/黄金圈|Golden\s*Circle/i.test(m)) return '黄金圈';
  return undefined;
}

/**
 * CASE-E01：延误场景规则结论（骨架；真实天气/路况由调用方注入 evidence）。
 */
export function buildDelayFeasibilityConclusion(input: {
  contract: AgentTaskContractV1;
  message: string;
  evidence?: LiveEvidenceFactV1[];
  /** 相对原计划剩余车程（小时），未知则用保守默认 */
  remainingDriveHours?: number | null;
}): LiveExecutionPipelineResultV1 {
  assertLiveExecutionEntry(input.contract);
  const phasesCompleted: LiveExecutionPhase[] = ['INTAKE', 'CONTEXT', 'EVIDENCE'];
  const delayH = parseDelayHoursFromMessage(input.message) ?? 0;
  const dest = detectLiveDestinationHint(input.message) ?? '目的地';
  const remaining = input.remainingDriveHours ?? 3.5;
  const evidence: LiveEvidenceFactV1[] = [
    ...(input.evidence ?? []),
    {
      key: 'delay_hours',
      valueZh: `相对计划延误约 ${delayH} 小时`,
      freshness: 'ASSUMED',
      source: 'user_message',
    },
    {
      key: 'remaining_drive_hours',
      valueZh: `预估剩余车程约 ${remaining} 小时`,
      freshness: input.remainingDriveHours != null ? 'LIVE' : 'ASSUMED',
      source: input.remainingDriveHours != null ? 'trip_slice' : 'default_is_south_coast',
    },
    {
      key: 'destination',
      valueZh: dest,
      freshness: 'ASSUMED',
      source: 'user_message',
    },
  ];

  phasesCompleted.push('JUDGE', 'ALTERNATIVES');
  /** 粗规则：延误后若剩余日照窗口不足（默认假设傍晚前需抵达），给条件结论 */
  const slack = 2.0;
  let verdict: LiveExecutionVerdict = 'CONDITIONAL';
  let conclusionZh: string;
  let deadlineZh: string | undefined;
  const alternativesZh: string[] = [];

  if (liveEvidenceImpliesHardBlock(evidence)) {
    verdict = 'NO';
    conclusionZh = `当前 LIVE 天气/路况显示硬阻断，不建议继续赶往「${dest}」。`;
    alternativesZh.push('改就近安全目标', '返回住宿待命', '确认路况恢复后再出发');
  } else if (delayH <= 0) {
    verdict = 'YES';
    conclusionZh = `按当前信息仍可前往「${dest}」，未见明确延误。`;
  } else if (delayH + remaining > remaining + slack + 2) {
    verdict = 'NO';
    conclusionZh = `晚了约 ${delayH} 小时后，再赶「${dest}」风险偏高（车程约 ${remaining}h + 日照/疲劳窗口紧张）。不建议硬赶全段。`;
    alternativesZh.push('改为次日早出发', '缩短当日目标，改就近景点', '确认后再改行程（需新 Adjustment task）');
  } else {
    verdict = 'CONDITIONAL';
    deadlineZh = `建议在延误吸收后仍保留至少 ${slack} 小时缓冲；若当地日落前不足 ${remaining + slack} 小时车窗，则放弃当日「${dest}」。`;
    conclusionZh = `有条件：晚 ${delayH} 小时后仍可能去「${dest}」，但须压缩停留并尽早出发。`;
    alternativesZh.push('缩短冰河湖停留改为观景点打卡', '改去半路高光（如维克/黑沙滩）', '把冰河湖挪到次日');
  }

  if (!liveEvidenceHasLiveWeatherOrRoad(evidence)) {
    conclusionZh += '（证据多为假设，非 LIVE 天气/路况；请结合传感器后再定。）';
  } else if (verdict === 'CONDITIONAL') {
    conclusionZh += '（已结合 LIVE 天气/路况证据。）';
  }

  phasesCompleted.push('DONE');
  let conclusion: LiveExecutionConclusionV1 = {
    schemaId: LIVE_EXECUTION_CONCLUSION_SCHEMA,
    version: 1,
    conclusionId: `live_${input.contract.taskId}`,
    tripId: input.contract.tripId,
    taskId: input.contract.taskId,
    questionZh: String(input.message ?? '').trim().slice(0, 200),
    verdict,
    conclusionZh,
    deadlineZh,
    alternativesZh,
    evidence,
    applyPlanAllowed: false,
    requiresStrongConfirmationToMutate: true,
  };

  /** Hardening：Evidence Sufficiency 绑定结论强度 */
  const evidenceContract: EvidenceFactV1[] = evidence.map((e) => ({
    key: e.key,
    valueZh: e.valueZh,
    freshness: normalizeEvidenceFreshness(e.freshness),
    source: e.source,
  }));
  const enforced = enforceConclusionAgainstEvidence(conclusion, evidenceContract);
  conclusion = {
    ...conclusion,
    verdict: enforced.verdict,
    conclusionZh: enforced.conclusionZh,
  };

  return { conclusion, phasesCompleted };
}

export function runLiveExecutionPipeline(input: {
  contract: AgentTaskContractV1;
  message: string;
  evidence?: LiveEvidenceFactV1[];
  remainingDriveHours?: number | null;
}): LiveExecutionPipelineResultV1 {
  assertLiveExecutionEntry(input.contract);
  if (
    parseDelayHoursFromMessage(input.message) != null ||
    /还能去|来得及|晚了|晚点|延误/.test(input.message)
  ) {
    return buildDelayFeasibilityConclusion(input);
  }
  /** 通用占位：要求 Evidence，不给无证据强结论 */
  const evidence = input.evidence?.length
    ? input.evidence
    : [
        {
          key: 'insufficient_live_context',
          valueZh: '缺少 LIVE 位置/天气/路况证据',
          freshness: 'UNKNOWN' as const,
          source: 'harness',
        },
      ];
  return {
    phasesCompleted: ['INTAKE', 'CONTEXT', 'EVIDENCE', 'JUDGE', 'ALTERNATIVES', 'DONE'],
    conclusion: {
      schemaId: LIVE_EXECUTION_CONCLUSION_SCHEMA,
      version: 1,
      conclusionId: `live_${input.contract.taskId}`,
      tripId: input.contract.tripId,
      taskId: input.contract.taskId,
      questionZh: String(input.message ?? '').trim().slice(0, 200),
      verdict: 'CONDITIONAL',
      conclusionZh: evidence.some((e) => e.key === 'insufficient_live_context')
        ? '证据不足，无法给出强硬「能/不能」结论；请补充当前位置、时间与路况后再问。'
        : '已结合所给证据给出条件性判断；改行程需另开 Adjustment 并确认。',
      alternativesZh: ['等待 LIVE 传感器结果', '改为咨询态查询风险', '确认后再调整行程'],
      evidence,
      applyPlanAllowed: false,
      requiresStrongConfirmationToMutate: true,
    },
  };
}

export function projectLiveExecutionForTrace(
  conclusion: LiveExecutionConclusionV1,
): Record<string, unknown> {
  return {
    schema_id: conclusion.schemaId,
    conclusion_id: conclusion.conclusionId,
    task_id: conclusion.taskId,
    verdict: conclusion.verdict,
    deadline_zh: conclusion.deadlineZh ?? null,
    alternative_count: conclusion.alternativesZh.length,
    evidence_count: conclusion.evidence.length,
    apply_plan_allowed: conclusion.applyPlanAllowed,
    requires_strong_confirmation_to_mutate: conclusion.requiresStrongConfirmationToMutate,
  };
}

export function buildLiveExecutionAnswerZh(conclusion: LiveExecutionConclusionV1): string {
  const lines = [conclusion.conclusionZh];
  if (conclusion.deadlineZh) lines.push(`截止/窗口：${conclusion.deadlineZh}`);
  if (conclusion.alternativesZh.length) {
    lines.push(`备选：${conclusion.alternativesZh.join('；')}`);
  }
  const ev = conclusion.evidence
    .slice(0, 4)
    .map((e) => `${e.key}=${e.valueZh}[${e.freshness}]`)
    .join('；');
  if (ev) lines.push(`证据：${ev}`);
  lines.push('此结论不会自动改行程；若要改计划请明确确认后开 Adjustment。');
  return lines.join('\n');
}
