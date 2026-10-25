/**
 * Phase 4 P0 — Assemble Decision Trace from PD pipeline outputs.
 */

import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { LensActivationDecisionV1 } from '../lenses/lens-activation.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import type { ProactiveInterventionDecisionV1 } from '../intervention/evaluate-proactive-intervention.util';
import {
  PROACTIVE_DECISION_TRACE_SCHEMA,
  buildImpactTraceKey,
  mapOptionToProductLabel,
  mapSignalKindToTraceLabel,
  type ProactiveDecisionTraceV1,
} from './proactive-decision-trace.types';

export type BuildProactiveDecisionTraceInput = {
  impact: ProactiveImpactV1;
  lens: LensActivationDecisionV1 | null;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
  decisionProblemId?: string | null;
  windFromMps?: number;
  windToMps?: number;
  localTimeHint?: string;
  at?: string;
};

function riskFromImpactLevel(
  level: ProactiveImpactV1['impactLevel'],
): ProactiveDecisionTraceV1['abu']['risk'] {
  return level;
}

function buildSignalSummaryZh(input: BuildProactiveDecisionTraceInput): string {
  const labels = input.impact.affectedItemLabels?.join('、') || '行程相关地点';
  if (
    input.impact.signalKind === 'WEATHER_WIND' &&
    input.windFromMps != null &&
    input.windToMps != null
  ) {
    const time = input.localTimeHint ? `（约 ${input.localTimeHint}）` : '';
    return `${labels} 风力 ${input.windFromMps}→${input.windToMps} m/s${time}`;
  }
  return input.impact.rationaleZh;
}

function stripPersonaNamesZh(text: string): string {
  return text
    .replace(/\bABU\b/gi, '')
    .replace(/\bDR[_\s.-]?DRE\b/gi, '')
    .replace(/\bNeptune\b/gi, '')
    .replace(/Abu\s*\+\s*Dr\.?\s*Dre/gi, '')
    .replace(/Abu/gi, '')
    .replace(/Dr\.?\s*Dre/gi, '')
    .replace(/\s*[→\-]\s*/g, ' ')
    .replace(/综合\s*评估/g, '综合评估')
    .replace(/[；;]\s*[；;]/g, '；')
    .replace(/\s{2,}/g, ' ')
    .replace(/（\s*）/g, '')
    .trim();
}

function buildWhyExplainZh(input: {
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1 | null;
  intervention: ProactiveInterventionDecisionV1 | null;
}): string {
  const what = input.impact.rationaleZh;
  const who =
    input.impact.affectedItemLabels?.length
      ? `受影响：${input.impact.affectedItemLabels.join('、')}。`
      : '';
  const suggest = input.synthesis
    ? `建议：${input.synthesis.recommended.titleZh}。${stripPersonaNamesZh(input.synthesis.recommended.summaryZh)}`
    : '';
  const gate =
    input.intervention?.gate === 'SILENT_LEARNING'
      ? '本次未打扰你（未过干预阈值），已记录以便后续优化。'
      : input.intervention?.gate === 'NOTIFY_CARD'
        ? '因此主动提醒你确认是否调整。'
        : '';
  return stripPersonaNamesZh(
    [what, who, suggest, gate].filter(Boolean).join(' ').trim(),
  );
}

/**
 * Build replayable Decision Trace for「为什么提醒我？」.
 */
export function buildProactiveDecisionTrace(
  input: BuildProactiveDecisionTraceInput,
): ProactiveDecisionTraceV1 {
  const labels = input.impact.affectedItemLabels ?? [];
  const abuOn = input.lens?.activateAbu ?? false;
  const dreOn = input.lens?.activateDrDre ?? false;
  const nepOn = input.lens?.activateNeptune ?? false;

  const alternatives =
    input.synthesis?.rankedOptions.filter((o) => o.feasible).length ?? 0;

  const neptuneMode: ProactiveDecisionTraceV1['neptune']['mode'] = nepOn
    ? input.lens?.requirePostRepairRecheck
      ? 'required'
      : 'conditional'
    : 'off';

  const recommendedScores = input.synthesis?.rankedOptions.find(
    (o) => o.optionId === input.synthesis?.recommended.optionId,
  )?.scores;

  return {
    schemaId: PROACTIVE_DECISION_TRACE_SCHEMA,
    version: 1,
    tripId: input.impact.tripId,
    decisionProblemId: input.decisionProblemId ?? null,
    caseId: input.impact.caseId,
    at: input.at ?? new Date().toISOString(),
    signal: {
      label: mapSignalKindToTraceLabel(input.impact.signalKind),
      kind: input.impact.signalKind,
      signalEventId: input.impact.signalEventId,
      summaryZh: buildSignalSummaryZh(input),
      windFromMps: input.windFromMps,
      windToMps: input.windToMps,
      localTimeHint: input.localTimeHint,
    },
    impact: {
      key: buildImpactTraceKey({
        affectedLabels: labels,
        affectedItemIds: input.impact.affectedItems,
      }),
      summaryZh: input.impact.rationaleZh,
      affectedItemIds: [...input.impact.affectedItems],
      affectedLabels: [...labels],
      impactLevel: input.impact.impactLevel,
      decisionRequired: input.impact.decisionRequired,
    },
    abu: {
      required: abuOn,
      risk: abuOn ? riskFromImpactLevel(input.impact.impactLevel) : null,
      verdict:
        recommendedScores?.abuVerdict ??
        input.synthesis?.hardGate.abuVerdict ??
        null,
    },
    dre: {
      required: dreOn,
      utilityDrop:
        dreOn &&
        (input.impact.caseId === 'CASE_CONTINUE_ACTIVITY' ||
          input.impact.caseId === 'CASE_POSTPONE_ACTIVITY' ||
          (recommendedScores?.utility != null &&
            recommendedScores.utility < 0.5)),
    },
    neptune: {
      mode: neptuneMode,
      activated: nepOn,
      alternatives,
    },
    cgus: {
      selected: input.synthesis?.recommended.optionId ?? null,
      selectedLabel: mapOptionToProductLabel(
        input.synthesis?.recommended.optionId,
      ),
      confidence: input.synthesis?.confidence ?? null,
      reasonZh: input.synthesis?.reasonZh ?? null,
      impactZh: input.synthesis?.impactZh ?? null,
    },
    intervention: {
      value: input.intervention?.value.interventionValue ?? null,
      gate: input.intervention?.gate ?? null,
      threshold: input.intervention?.value.threshold ?? null,
    },
    lenses: {
      order: input.lens ? [...input.lens.lensOrder] : [],
      activateAbu: abuOn,
      activateDrDre: dreOn,
      activateNeptune: nepOn,
    },
    whyExplainZh: buildWhyExplainZh({
      impact: input.impact,
      synthesis: input.synthesis,
      intervention: input.intervention,
    }),
  };
}

/** Compact product-shape JSON for logs / admin replay */
export function toProactiveDecisionTraceReplayJson(
  trace: ProactiveDecisionTraceV1,
): Record<string, unknown> {
  return {
    signal: trace.signal.label,
    impact: trace.impact.key,
    abu: {
      risk: trace.abu.risk,
      required: trace.abu.required,
      verdict: trace.abu.verdict,
    },
    dre: {
      utility_drop: trace.dre.utilityDrop,
      required: trace.dre.required,
    },
    neptune: {
      alternatives: trace.neptune.alternatives,
      activated: trace.neptune.activated,
      mode: trace.neptune.mode,
    },
    cgus: {
      selected: trace.cgus.selectedLabel ?? trace.cgus.selected,
      confidence: trace.cgus.confidence,
      reason: trace.cgus.reasonZh,
    },
    intervention: {
      value: trace.intervention.value,
      gate: trace.intervention.gate,
    },
  };
}
