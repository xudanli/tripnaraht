/**
 * Build shared causal persona projection from Decision Kernel outputs.
 */

import type { TripWorldState } from '../../decision/world-model';
import type { PlanState } from '../../../skills/plan/shared/plan-state.types';
import type { DecisionCausalityRecord } from '../decision-causality-v1.types';
import { isDecisionCausalityRecordV1 } from '../decision-causality-v1.types';
import type { IcelandSelfDriveCausalOutput } from '../domains/iceland-self-drive-causal.types';
import { isIcelandDestination } from '../domains/trip-world-state-iceland-causal.util';
import type {
  CausalPersonaProjection,
  CausalPersonaSlice,
} from './causal-persona-projection.types';
import { CAUSAL_PERSONA_PROJECTION_SCHEMA } from './causal-persona-projection.types';

export function buildCausalPersonaProjection(input: {
  worldState?: TripWorldState;
  planState?: PlanState;
  icelandAssessment?: IcelandSelfDriveCausalOutput;
  causalityRecord?: DecisionCausalityRecord;
}): CausalPersonaProjection | null {
  const iceland =
    input.icelandAssessment ?? input.worldState?.signals.icelandSelfDriveCausalAssessment;
  const record =
    input.causalityRecord ?? latestCausalityRecord(input.worldState);
  const planState = input.planState;

  const destination =
    input.worldState?.context.destination ??
    planState?.world?.routeDirection?.countryCode ??
    planState?.metadata?.destination;

  const isIceland = isIcelandDestination(String(destination ?? ''));
  const gateNeedsProjection =
    planState?.gate?.status === 'REJECT' ||
    planState?.gate?.status === 'SUGGEST_REPLACE' ||
    planState?.gate?.status === 'NEED_CONFIRM';
  if (!iceland && !record && !planState?.gate?.guardianResults && !gateNeedsProjection) {
    return null;
  }

  const abu = buildAbuSlice({ iceland, record, planState, isIceland });
  const drdre = buildDreSlice({ iceland, record, planState });
  const neptune = buildNeptuneSlice({ iceland, record, planState });

  if (!abu && !drdre && !neptune) return null;

  const userFacing =
    iceland?.userFacingAssessment ??
    (record && isDecisionCausalityRecordV1(record)
      ? record.causal_decision?.expectedOutcome?.narrative
      : undefined);

  return {
    schema: CAUSAL_PERSONA_PROJECTION_SCHEMA,
    causality_id: record?.causality_id ?? input.worldState?.signals.lastDecisionCausalityId,
    abu,
    drdre,
    neptune,
    consolidatedSummary: userFacing,
    userFacingAssessment: userFacing,
    kernelAuthoritative: Boolean(abu || drdre || neptune),
  };
}

function latestCausalityRecord(
  state?: TripWorldState,
): DecisionCausalityRecord | undefined {
  const chain = state?.signals.decisionCausalityChain;
  if (!chain?.length) return undefined;
  return chain[chain.length - 1];
}

function buildAbuSlice(input: {
  iceland?: IcelandSelfDriveCausalOutput;
  record?: DecisionCausalityRecord;
  planState?: PlanState;
  isIceland: boolean;
}): CausalPersonaSlice | undefined {
  const { iceland, record, planState, isIceland } = input;

  if (iceland) {
    const miss = iceland.missProbability;
    const verdict =
      miss >= 0.55 ? 'REJECT' : miss >= 0.25 ? 'NEED_CONFIRM' : 'ALLOW';
    return {
      persona: 'ABU',
      verdict,
      explanation: sliceAbuIcelandExplanation(iceland),
      causalChain: iceland.causalChain,
      evidence: iceland.bindings
        .filter((b) => b.variable.includes('wind') || b.variable.includes('miss'))
        .map((b) => ({
          source: '冰岛实况因果模块',
          excerpt: `${b.label}: ${formatBinding(b.baseValue, b.projectedValue, b.unit)}`,
          relevance: b.variable,
        })),
      source: 'iceland_causal_module',
    };
  }

  if (record?.execution_gate.type === 'BLOCK' || record?.policy_engine.verdict === 'BLOCK') {
    return {
      persona: 'ABU',
      verdict: 'REJECT',
      explanation: record.policy_engine.reasons[0] ?? '执行门控阻断：当前方案不可执行。',
      causalChain: record.policy_engine.codes.map((c) => `policy:${c}`),
      evidence: record.policy_engine.reasons.map((r) => ({
        source: 'Decision Kernel',
        excerpt: r,
        relevance: 'policy_engine',
      })),
      source: 'decision_kernel',
    };
  }

  if (planState?.gate.status === 'REJECT') {
    return {
      persona: 'ABU',
      verdict: 'REJECT',
      explanation: planState.gate.reasons.join(' ') || '方案未通过安全门控。',
      causalChain: planState.gate.reasons.map((r) => `gate:${r}`),
      evidence: planState.gate.reasons.map((r) => ({
        source: 'Plan Gate',
        excerpt: r,
        relevance: 'hard_constraint',
      })),
      source: 'decision_kernel',
    };
  }

  if (isIceland && record?.policy_engine.verdict === 'DEGRADE') {
    return {
      persona: 'ABU',
      verdict: 'NEED_CONFIRM',
      explanation: `实况快照偏旧或条件恶化（${record.policy_engine.codes.join(', ')}），建议保守执行。`,
      causalChain: record.policy_engine.codes.map((c) => `policy:${c}`),
      evidence: record.policy_engine.reasons.map((r) => ({
        source: 'Decision Kernel',
        excerpt: r,
        relevance: 'degraded_reality',
      })),
      source: 'decision_kernel',
    };
  }

  return undefined;
}

function buildDreSlice(input: {
  iceland?: IcelandSelfDriveCausalOutput;
  record?: DecisionCausalityRecord;
  planState?: PlanState;
}): CausalPersonaSlice | undefined {
  const fatigue = input.planState?.pace?.fatigueScore;
  if (fatigue) {
    const score = fatigue.paceScore;
    if (score > 70) {
      return {
        persona: 'DR_DRE',
        verdict: score > 85 ? 'ADJUST' : 'NEED_CONFIRM',
        explanation: `疲劳负荷指数 ${score}/100。${score > 85 ? '按当前节奏，中后期执行概率会明显下降。' : '建议微调节奏以保持可持续。'}`,
        causalChain: ['human:fatigue_index', 'human:execution_sustainability', 'outcome:completion_rate'],
        evidence: (fatigue.fatigueDrivers ?? []).slice(0, 2).map((d) => ({
          source: 'Human Capability Model',
          excerpt: `${d.type}: ${d.description}`,
          relevance: 'fatigue_driver',
        })),
        recommendations: [
          {
            action: '插入休息或降低单日密度',
            reason: '疲劳累积',
            impact: '提升后续天数完成概率',
          },
        ],
        source: 'decision_kernel',
      };
    }
  }

  if (input.iceland) {
    const overrun =
      input.iceland.travelTime.p90Minutes - input.iceland.input.baseDurationMinutes;
    if (overrun >= 25) {
      return {
        persona: 'DR_DRE',
        verdict: 'ADJUST',
        explanation: `风吹延时后 P90 行程比计划多 ${overrun} 分钟，人体节奏与缓冲会被持续侵蚀。`,
        causalChain: [
          'environment:wind_mps',
          'travel:duration_p90',
          'human:schedule_pressure',
          'outcome:sustainability',
        ],
        evidence: [
          {
            source: '冰岛实况因果模块',
            excerpt: `P90 ${input.iceland.travelTime.p90Minutes} 分 vs 计划 ${input.iceland.input.baseDurationMinutes} 分`,
            relevance: 'travel_duration_stress',
          },
        ],
        source: 'iceland_causal_module',
      };
    }
  }

  return undefined;
}

function buildNeptuneSlice(input: {
  iceland?: IcelandSelfDriveCausalOutput;
  record?: DecisionCausalityRecord;
  planState?: PlanState;
}): CausalPersonaSlice | undefined {
  const tuple =
    input.record && isDecisionCausalityRecordV1(input.record)
      ? input.record.causal_decision
      : undefined;

  const icelandRec = input.iceland?.recommendedIntervention;
  const tupleIntervention =
    tuple?.chosenIntervention ?? tuple?.alternatives?.[0];

  if (icelandRec || tupleIntervention) {
    const actionLabel = icelandRec
      ? `提前 ${icelandRec.shiftMinutes} 分钟出发`
      : tupleIntervention!.title ??
        tupleIntervention!.description ??
        `执行 ${tupleIntervention!.type}`;

    return {
      persona: 'NEPTUNE',
      verdict: 'REPLACE',
      explanation:
        icelandRec?.rationale ??
        input.iceland?.userFacingAssessment?.split('。').slice(-1)[0] ??
        tupleIntervention?.description ??
        '已计算最小扰动干预方案。',
      causalChain:
        tuple?.hypothesis?.causalChain ??
        input.iceland?.causalChain ??
        ['intervention:search', 'outcome:miss_probability'],
      evidence: (tuple?.alternatives ?? [])
        .slice(0, 3)
        .map((alt) => ({
          source: 'Intervention Engine',
          excerpt: alt.title ?? alt.description ?? alt.type,
          relevance: alt.targetVariable,
        })),
      recommendations: [
        {
          action: actionLabel,
          reason: icelandRec?.rationale ?? '最小代价干预',
          impact: icelandRec
            ? '错过概率预计下降（见 Abu 评估）'
            : '降低错过核心体验概率',
        },
      ],
      intervention: tupleIntervention,
      source: input.iceland ? 'iceland_causal_module' : 'decision_kernel',
    };
  }

  if (input.planState?.gate.status === 'SUGGEST_REPLACE') {
    return {
      persona: 'NEPTUNE',
      verdict: 'REPLACE',
      explanation: '路线意图可保留，但部分结构需要最小替换。',
      causalChain: ['itinerary:conflict', 'intervention:repair', 'outcome:feasibility'],
      evidence: [],
      source: 'decision_kernel',
    };
  }

  return undefined;
}

function sliceAbuIcelandExplanation(iceland: IcelandSelfDriveCausalOutput): string {
  const missPct = Math.round(iceland.missProbability * 100);
  const wind = iceland.input.windMps;
  return `南岸/暴露路段当前风速约 ${wind.toFixed(0)} m/s，按 P90 行驶时间评估，错过核心预约的概率约 ${missPct}%。我负责判断：这条路在现有出发时间下风险偏高。`;
}

function formatBinding(
  base?: number,
  projected?: number,
  unit?: string,
): string {
  if (base == null && projected == null) return '—';
  const u = unit === 'ratio' ? '%' : unit === 'minutes' ? '分' : unit === 'm/s' ? ' m/s' : '';
  if (unit === 'ratio') {
    return `${Math.round((base ?? 0) * 100)}% → ${Math.round((projected ?? 0) * 100)}%`;
  }
  return `${base ?? '—'} → ${projected ?? '—'}${u}`;
}

export function attachCausalPersonaToPlanState(
  planState: PlanState,
  projection: CausalPersonaProjection | null | undefined,
): void {
  if (!planState.metadata) planState.metadata = {};
  if (!projection) {
    delete planState.metadata.causalPersonaProjection;
    return;
  }
  planState.metadata.causalPersonaProjection = projection;
}

export function readCausalPersonaFromPlanState(
  planState: PlanState,
): CausalPersonaProjection | undefined {
  return planState.metadata?.causalPersonaProjection as CausalPersonaProjection | undefined;
}
