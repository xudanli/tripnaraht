/**
 * unified-explainability@v1 → Decision Cockpit UI 字段投影（前端只读；SSOT 仍为 explain.unified）。
 */

import { buildUnifiedCounterfactualExplain } from './build-unified-counterfactual.util';
import type { NarrativeDriftObservabilitySlice } from './narrative-drift-monitor.util';
import type { UnifiedExplainabilityEnvelopeV1 } from './unified-explainability.types';

export const DECISION_COCKPIT_CONTRACT_VERSION = 'decision-cockpit@v1' as const;

export type DecisionCockpitTraceRowV1 = {
  log_index: number;
  persona: string;
  action: string;
  decision_source: string;
  decision_stage: string;
  reason_codes: string[];
  evidence_refs: string[];
  explanation: string;
};

export type DecisionCockpitRiskFactorV1 = {
  factor_id: string;
  kind: string;
  severity: string;
  label: string;
  reason_codes: string[];
  evidence_refs: string[];
};

export type DecisionCockpitPayloadV1 = {
  contract_version: typeof DECISION_COCKPIT_CONTRACT_VERSION;
  request_id: string;
  trace_id: string;
  generated_at: string;
  chosen_plan_id?: string;
  integrity_badges: {
    traceability_valid: boolean;
    physical_evidence_complete: boolean;
    narrative_anchored: boolean;
    drift_detected?: boolean;
    narrative_drift_score?: number;
  };
  decision_trace_rows: DecisionCockpitTraceRowV1[];
  risk_factors: DecisionCockpitRiskFactorV1[];
  counterfactuals: NonNullable<ReturnType<typeof buildUnifiedCounterfactualExplain>>['counterfactuals'];
  world_constraints?: {
    applied_events: number;
    road_ids: string[];
    weather_dates: string[];
  };
  monte_carlo?: {
    used: boolean;
    total_samples?: number;
  };
  verdict_narration_zh?: string;
  apis: {
    counterfactual: 'POST /api/decision/explain/unified/counterfactual';
    unified_ssot_field: 'explain.unified';
  };
};

function mapTraceRows(envelope: UnifiedExplainabilityEnvelopeV1): DecisionCockpitTraceRowV1[] {
  return envelope.decision_trace.map((t) => ({
    log_index: t.log_index,
    persona: t.persona,
    action: t.action,
    decision_source: t.decision_source,
    decision_stage: t.decision_stage,
    reason_codes: t.reason_codes ?? [],
    evidence_refs: t.evidence_refs ?? [],
    explanation: t.explanation,
  }));
}

/** 至少一行含说明、reason code 或非空阶段，才值得展示 Decision Cockpit */
function hasMeaningfulDecisionTraceRows(rows: DecisionCockpitTraceRowV1[]): boolean {
  return rows.some(
    (r) =>
      Boolean(String(r.explanation ?? '').trim()) ||
      (r.reason_codes?.length ?? 0) > 0 ||
      Boolean(String(r.decision_stage ?? '').trim()),
  );
}

function mapRiskFactors(envelope: UnifiedExplainabilityEnvelopeV1): DecisionCockpitRiskFactorV1[] {
  return envelope.grounded_factors
    .filter((f) => f.severity === 'BLOCK' || f.severity === 'WARN')
    .map((f) => {
      const anchoredLogs = f.anchor_log_indices
        .map((i) => envelope.decision_trace[i])
        .filter(Boolean);
      return {
        factor_id: f.factor_id,
        kind: f.kind,
        severity: f.severity,
        label: f.rejection_reason ?? anchoredLogs[0]?.explanation ?? f.factor_id,
        reason_codes: anchoredLogs.flatMap((l) => l.reason_codes ?? []),
        evidence_refs: f.anchor_evidence_refs ?? [],
      };
    });
}

export function projectDecisionCockpitFromEnvelope(params: {
  envelope: UnifiedExplainabilityEnvelopeV1;
  narrativeDrift?: NarrativeDriftObservabilitySlice;
}): DecisionCockpitPayloadV1 | undefined {
  const { envelope } = params;
  const traceRows = mapTraceRows(envelope);
  if (
    !hasMeaningfulDecisionTraceRows(traceRows) &&
    !envelope.optimization_projection?.decision_verdict
  ) {
    return undefined;
  }

  const verdict = envelope.optimization_projection?.decision_verdict;
  const counterfactualBundle = buildUnifiedCounterfactualExplain({ envelope });
  const wm = envelope.optimization_projection?.world_constraint_materialization;

  return {
    contract_version: DECISION_COCKPIT_CONTRACT_VERSION,
    request_id: envelope.request_id,
    trace_id: envelope.trace_id,
    generated_at: envelope.generated_at,
    chosen_plan_id: verdict?.chosen_plan_id,
    integrity_badges: {
      traceability_valid: envelope.integrity.traceability_valid,
      physical_evidence_complete: envelope.integrity.physical_evidence_complete,
      narrative_anchored: envelope.integrity.narrative_anchored,
      drift_detected: params.narrativeDrift?.drift_detected,
      narrative_drift_score: params.narrativeDrift?.narrative_drift_score,
    },
    decision_trace_rows: traceRows,
    risk_factors: mapRiskFactors(envelope),
    counterfactuals: counterfactualBundle?.counterfactuals ?? [],
    ...(wm
      ? {
          world_constraints: {
            applied_events: wm.applied_events,
            road_ids: wm.road_ids ?? [],
            weather_dates: wm.weather_dates ?? [],
          },
        }
      : {}),
    ...(verdict?.monte_carlo_summary
      ? {
          monte_carlo: {
            used: verdict.monte_carlo_summary.used,
            total_samples: verdict.monte_carlo_summary.total_samples,
          },
        }
      : {}),
    verdict_narration_zh: envelope.optimization_projection?.decision_verdict_narration_zh,
    apis: {
      counterfactual: 'POST /api/decision/explain/unified/counterfactual',
      unified_ssot_field: 'explain.unified',
    },
  };
}
