import type {
  OptimizationSuggestion,
  RobustnessMetrics,
  WhatIfAction,
  WhatIfCandidate,
  WhatIfReport,
} from '../../planning-policy/services/robustness-evaluator.service';
import { mapWhatIfActionToTripIntervention } from './trip-intervention.mapper';
import type {
  CausalVariableBinding,
  PlanBInterventionPayloadV1,
  TrustInterventionEffect,
  WhatIfCausalProjection,
} from './what-if-intervention.types';
import { PLAN_B_INTERVENTION_PAYLOAD_SCHEMA } from './what-if-intervention.types';
import type { TripIntervention } from './trip-intervention.types';
import {
  analyzeIcelandWithShift,
  mergeIcelandCausalIntoProjection,
} from './domains/iceland-causal-bridge';
import type { IcelandSelfDriveCausalOutput } from './domains/iceland-self-drive-causal.types';

export function buildWhatIfCausalProjection(input: {
  action?: WhatIfAction;
  baseMetrics: RobustnessMetrics;
  candidateMetrics: RobustnessMetrics;
  deltaSummary?: WhatIfCandidate['deltaSummary'];
  explainTopDrivers?: WhatIfCandidate['explainTopDrivers'];
}): WhatIfCausalProjection {
  const { action, baseMetrics, candidateMetrics, deltaSummary, explainTopDrivers } = input;
  const primaryDriver = explainTopDrivers?.[0]?.driver ?? inferPrimaryDriver(deltaSummary);
  const chain: string[] = [];

  if (action?.type === 'SHIFT_EARLIER') {
    chain.push(
      'temporal:departure_time',
      'temporal:travel_duration',
      'temporal:appointment_window',
      'outcome:miss_probability',
    );
  } else if (action?.type === 'SWAP_NEIGHBOR') {
    chain.push(
      'itinerary:poi_order',
      'temporal:window_wait',
      'outcome:wait_probability',
    );
  } else if (action?.type === 'REMOVE_ITEM' || action?.type === 'ADD_BUFFER') {
    chain.push(
      `itinerary:${action.type === 'REMOVE_ITEM' ? 'poi_removed' : 'buffer_added'}`,
      'temporal:schedule_slack',
      'outcome:miss_probability',
    );
  } else {
    chain.push('itinerary:plan_change', 'outcome:feasibility');
  }

  const bindings: CausalVariableBinding[] = [
    {
      variable: 'outcome:miss_probability',
      label: '错过预约/窗口概率',
      baseValue: roundRatio(baseMetrics.timeWindowMissProb),
      projectedValue: roundRatio(candidateMetrics.timeWindowMissProb),
      unit: 'ratio',
    },
    {
      variable: 'outcome:on_time_probability',
      label: '准点完成概率',
      baseValue: roundRatio(baseMetrics.onTimeProb),
      projectedValue: roundRatio(candidateMetrics.onTimeProb),
      unit: 'ratio',
    },
    {
      variable: 'outcome:completion_p10',
      label: '完成率 P10',
      baseValue: roundRatio(baseMetrics.completionRateP10),
      projectedValue: roundRatio(candidateMetrics.completionRateP10),
      unit: 'ratio',
    },
  ];

  if (action?.type === 'SHIFT_EARLIER' && action.type === 'SHIFT_EARLIER') {
    bindings.unshift({
      variable: `temporal:poi_start:${action.poiId}`,
      label: '出发/开始时间',
      baseValue: 0,
      projectedValue: -action.minutes,
      unit: 'minutes',
    });
  }

  return {
    causalChain: chain,
    bindings,
    primaryDriver,
  };
}

export function enrichWhatIfCandidateWithIntervention(
  candidate: WhatIfCandidate,
  ctx: {
    baseMetrics: RobustnessMetrics;
    suggestion?: OptimizationSuggestion;
  },
): WhatIfCandidate {
  if (!candidate.action) return candidate;

  const confidenceScore =
    candidate.confidence?.level === 'HIGH'
      ? 0.85
      : candidate.confidence?.level === 'MEDIUM'
        ? 0.65
        : 0.45;

  const intervention = mapWhatIfActionToTripIntervention(candidate.action, {
    interventionId: candidate.id,
    confidence: confidenceScore,
  });

  const causalProjection = buildWhatIfCausalProjection({
    action: candidate.action,
    baseMetrics: ctx.baseMetrics,
    candidateMetrics: candidate.metrics,
    deltaSummary: candidate.deltaSummary,
    explainTopDrivers: candidate.explainTopDrivers,
  });

  applyMetricsToInterventionEffects(intervention, causalProjection, candidate.deltaSummary);

  return {
    ...candidate,
    intervention,
    causalProjection,
  };
}

export function enrichWhatIfReport(
  report: WhatIfReport,
  options?: {
    icelandAssessment?: IcelandSelfDriveCausalOutput;
  },
): WhatIfReport {
  const baseMetrics = report.base.metrics;

  const candidates = report.candidates.map((c) => {
    let enriched = enrichWhatIfCandidateWithIntervention(c, { baseMetrics });
    if (options?.icelandAssessment && c.action?.type === 'SHIFT_EARLIER') {
      enriched = mergeIcelandOntologyIntoCandidate(enriched, options.icelandAssessment, c.action.minutes);
    }
    return enriched;
  });

  const winner = candidates.find((c) => c.id === report.winnerId);
  const iceland = options?.icelandAssessment;

  return {
    ...report,
    candidates,
    recommendedIntervention: winner?.intervention,
    causalHypothesis: winner?.causalProjection
      ? {
          failureMode: winner.deltaSummary?.reason ?? winner.title,
          causalChain: winner.causalProjection.causalChain,
          baseMissProb: iceland?.missProbability ?? roundRatio(baseMetrics.timeWindowMissProb),
          projectedMissProb:
            iceland?.missProbabilityAfterShift ??
            (winner.metrics ? roundRatio(winner.metrics.timeWindowMissProb) : undefined) ??
            roundRatio(baseMetrics.timeWindowMissProb),
          missDeltaPp: winner.deltaSummary?.missDelta,
        }
      : iceland
        ? {
            failureMode: 'wind_elevated_travel_time',
            causalChain: iceland.causalChain,
            baseMissProb: iceland.missProbability,
            projectedMissProb: iceland.missProbabilityAfterShift ?? iceland.missProbability,
          }
        : undefined,
    icelandAssessment: iceland,
    userFacingAssessment:
      iceland?.userFacingAssessment ??
      (winner ? formatInterventionSummaryForTrustSurface(winner.intervention!, winner.causalProjection) : undefined),
  };
}

function mergeIcelandOntologyIntoCandidate(
  candidate: WhatIfCandidate,
  iceland: IcelandSelfDriveCausalOutput,
  shiftMinutes: number,
): WhatIfCandidate {
  const shifted = analyzeIcelandWithShift(iceland.input, shiftMinutes);
  return {
    ...candidate,
    causalProjection: mergeIcelandCausalIntoProjection(shifted, candidate.causalProjection),
  };
}

export function tripInterventionToTrustEffects(
  intervention: TripIntervention,
  projection?: WhatIfCausalProjection,
): TrustInterventionEffect[] {
  return intervention.expectedEffects.map((effect) => {
    const binding = projection?.bindings.find((b) => b.variable.includes(effect.metric.split('_')[0] ?? ''));
    return {
      ...effect,
      targetVariable: intervention.targetVariable,
      label: binding?.label ?? effect.metric,
    };
  });
}

export function buildPlanBInterventionPayload(
  candidate: WhatIfCandidate,
): PlanBInterventionPayloadV1 | null {
  if (!candidate.intervention) return null;
  return {
    schema: PLAN_B_INTERVENTION_PAYLOAD_SCHEMA,
    intervention: candidate.intervention,
    causalProjection: candidate.causalProjection,
  };
}

export function serializePlanBInterventionPayload(payload: PlanBInterventionPayloadV1): string {
  return JSON.stringify(payload);
}

export function parsePlanBInterventionPayload(raw: string | null | undefined): PlanBInterventionPayloadV1 | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(trimmed) as PlanBInterventionPayloadV1;
    if (parsed?.schema !== PLAN_B_INTERVENTION_PAYLOAD_SCHEMA) return null;
    if (!parsed.intervention?.interventionId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function formatInterventionSummaryForTrustSurface(
  intervention: TripIntervention,
  projection?: WhatIfCausalProjection,
): string {
  const missBinding = projection?.bindings.find((b) => b.variable.includes('miss_probability'));
  const parts: string[] = [intervention.title ?? intervention.type.replace(/_/g, ' ')];

  if (missBinding?.baseValue != null && missBinding.projectedValue != null) {
    const deltaPp = Math.round((missBinding.projectedValue - missBinding.baseValue) * 100);
    const sign = deltaPp <= 0 ? '' : '+';
    parts.push(
      `错过概率 ${Math.round(missBinding.baseValue * 100)}%→${Math.round(missBinding.projectedValue * 100)}% (${sign}${deltaPp}pp)`,
    );
  }

  const topEffect = intervention.expectedEffects[0];
  if (topEffect && !missBinding) {
    parts.push(`${topEffect.metric} ${topEffect.direction === 'UP' ? '↑' : '↓'}`);
  }

  return parts.join(' · ');
}

function applyMetricsToInterventionEffects(
  intervention: TripIntervention,
  _projection: WhatIfCausalProjection,
  deltaSummary?: WhatIfCandidate['deltaSummary'],
): void {
  for (const effect of intervention.expectedEffects) {
    if (effect.metric === 'miss_probability' && deltaSummary?.missDelta != null) {
      effect.estimatedMagnitude = Math.abs(deltaSummary.missDelta);
      effect.direction = deltaSummary.missDelta <= 0 ? 'DOWN' : 'UP';
    }
    if (effect.metric === 'on_time_probability' && deltaSummary?.onTimeDelta != null) {
      effect.estimatedMagnitude = Math.abs(deltaSummary.onTimeDelta);
      effect.direction = deltaSummary.onTimeDelta >= 0 ? 'UP' : 'DOWN';
    }
  }
}

function inferPrimaryDriver(
  deltaSummary?: WhatIfCandidate['deltaSummary'],
): WhatIfCausalProjection['primaryDriver'] {
  if (!deltaSummary) return undefined;
  const scores = [
    { driver: 'MISS' as const, v: Math.abs(deltaSummary.missDelta ?? 0) },
    { driver: 'WAIT' as const, v: Math.abs(deltaSummary.waitDelta ?? 0) },
    { driver: 'COMPLETION_P10' as const, v: Math.abs(deltaSummary.completionP10Delta ?? 0) },
    { driver: 'ONTIME' as const, v: Math.abs(deltaSummary.onTimeDelta ?? 0) },
  ];
  scores.sort((a, b) => b.v - a.v);
  return scores[0]?.v ? scores[0].driver : undefined;
}

function roundRatio(x: number): number {
  return Math.round(x * 1000) / 1000;
}
