/**
 * unified-explainability 叙事漂移在线监测（确定性；无 NLI/LLM judge）。
 * 对比 envelope trace / grounded_factors 与 risk_highlights / guardian 投影是否一致。
 */

import { createHash } from 'crypto';
import type { NarrationLike } from '../../../decision/kernel/interfaces/phase-executor.interface';
import type { ExplainForHumanProjection } from './project-explain-for-human-from-envelope.util';
import type { UnifiedExplainabilityEnvelopeV1 } from './unified-explainability.types';

export const NARRATIVE_DRIFT_MONITOR_VERSION = 1 as const;
export const NARRATIVE_DRIFT_OBSERVABILITY_SCHEMA = 'decision-os/narrative-drift/v1' as const;

export type NarrativeDriftViolation = {
  code:
    | 'envelope_integrity'
    | 'orphan_reason_code'
    | 'orphan_evidence_ref'
    | 'orphan_factor_id'
    | 'block_factor_unsurfaced';
  message: string;
};

export type NarrativeDriftReport = {
  monitor_version: typeof NARRATIVE_DRIFT_MONITOR_VERSION;
  drift_detected: boolean;
  narrative_anchored: boolean;
  traceability_valid: boolean;
  physical_evidence_complete: boolean;
  violations: NarrativeDriftViolation[];
  violation_count: number;
  /** 1 = 无漂移；按违规严重度递减 */
  narrative_drift_score: number;
  violation_fingerprint?: string;
};

export type NarrativeDriftObservabilitySlice = {
  schema: typeof NARRATIVE_DRIFT_OBSERVABILITY_SCHEMA;
  monitor_version: typeof NARRATIVE_DRIFT_MONITOR_VERSION;
  drift_detected: boolean;
  narrative_anchored: boolean;
  traceability_valid: boolean;
  physical_evidence_complete: boolean;
  narrative_drift_score: number;
  violation_count: number;
  violation_fingerprint?: string;
  reason_codes: string[];
  drift_summary_zh: string;
};

export type NarrativeDriftMetricEvent = {
  tripnara_metric: 'narrative_drift';
  metric_schema: 'narrative_drift/v1';
  request_id: string;
  trip_id?: string;
  narrative_drift_score: number;
  drift_detected: boolean;
  violation_count: number;
  violation_fingerprint?: string;
  reason_codes: string[];
};

function uniq(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

export function fingerprintNarrativeDriftViolations(violations: NarrativeDriftViolation[]): string | undefined {
  const keys = uniq(violations.map((v) => `${v.code}:${v.message.slice(0, 64)}`)).sort();
  if (keys.length === 0) return undefined;
  return createHash('sha256').update(keys.join('|'), 'utf8').digest('hex').slice(0, 16);
}

export function narrativeDriftScoreFromViolations(violations: NarrativeDriftViolation[]): number {
  if (violations.length === 0) return 1;
  let penalty = 0;
  for (const v of violations) {
    if (v.code === 'envelope_integrity') penalty += 0.35;
    else if (v.code === 'orphan_reason_code' || v.code === 'orphan_evidence_ref') penalty += 0.25;
    else if (v.code === 'block_factor_unsurfaced') penalty += 0.2;
    else penalty += 0.15;
  }
  return Math.max(0, 1 - Math.min(1, penalty));
}

function collectTraceReasonCodes(envelope: UnifiedExplainabilityEnvelopeV1): Set<string> {
  return new Set(envelope.decision_trace.flatMap((t) => t.reason_codes ?? []));
}

function collectTraceEvidenceRefs(envelope: UnifiedExplainabilityEnvelopeV1): Set<string> {
  return new Set(envelope.decision_trace.flatMap((t) => t.evidence_refs ?? []));
}

function collectFactorIds(envelope: UnifiedExplainabilityEnvelopeV1): Set<string> {
  return new Set(envelope.grounded_factors.map((f) => f.factor_id));
}

type RiskHighlightLike = ExplainForHumanProjection['riskHighlights'][number];

function checkRiskHighlights(
  envelope: UnifiedExplainabilityEnvelopeV1,
  riskHighlights: RiskHighlightLike[] | undefined,
  violations: NarrativeDriftViolation[],
): void {
  if (!riskHighlights?.length) return;
  const traceReasons = collectTraceReasonCodes(envelope);
  const traceEvidence = collectTraceEvidenceRefs(envelope);
  const factorIds = collectFactorIds(envelope);

  for (const [i, rh] of riskHighlights.entries()) {
    for (const code of rh.reason_codes ?? []) {
      if (!traceReasons.has(code)) {
        violations.push({
          code: 'orphan_reason_code',
          message: `risk_highlights[${i}]: reason_code "${code}" not in decision_trace`,
        });
      }
    }
    for (const ref of rh.evidence_refs ?? []) {
      if (!traceEvidence.has(ref)) {
        violations.push({
          code: 'orphan_evidence_ref',
          message: `risk_highlights[${i}]: evidence_ref "${ref}" not in decision_trace`,
        });
      }
    }
    for (const fid of rh.anchored_factor_ids ?? []) {
      if (!factorIds.has(fid)) {
        violations.push({
          code: 'orphan_factor_id',
          message: `risk_highlights[${i}]: anchored_factor_id "${fid}" not in grounded_factors`,
        });
      }
    }
  }
}

function checkBlockFactorsSurfaced(
  envelope: UnifiedExplainabilityEnvelopeV1,
  riskHighlights: RiskHighlightLike[] | undefined,
  violations: NarrativeDriftViolation[],
): void {
  if (!riskHighlights?.length) return;

  const blockFactors = envelope.grounded_factors.filter((f) => f.severity === 'BLOCK');
  if (blockFactors.length === 0) return;

  const surfacedReasons = new Set(riskHighlights.flatMap((rh) => rh.reason_codes ?? []));
  const surfacedEvidence = new Set(riskHighlights.flatMap((rh) => rh.evidence_refs ?? []));
  const surfacedFactors = new Set(riskHighlights.flatMap((rh) => rh.anchored_factor_ids ?? []));

  for (const factor of blockFactors) {
    const hasFactorAnchor = surfacedFactors.has(factor.factor_id);
    const hasReasonOverlap = factor.anchor_log_indices.some((i) => {
      const codes = envelope.decision_trace[i]?.reason_codes ?? [];
      return codes.some((c) => surfacedReasons.has(c));
    });
    const hasEvidenceOverlap = factor.anchor_evidence_refs.some((ref) => surfacedEvidence.has(ref));
    if (!hasFactorAnchor && !hasReasonOverlap && !hasEvidenceOverlap) {
      violations.push({
        code: 'block_factor_unsurfaced',
        message: `BLOCK factor "${factor.factor_id}" not reflected in risk_highlights`,
      });
    }
  }
}

export function assessNarrativeExplainabilityDrift(params: {
  envelope: UnifiedExplainabilityEnvelopeV1;
  riskHighlights?: RiskHighlightLike[];
  narration?: Pick<NarrationLike, 'risk_highlights' | 'guardian_narrative_zh' | 'unified_explainability'>;
}): NarrativeDriftReport {
  const { envelope } = params;
  const riskHighlights =
    params.riskHighlights ??
    (params.narration?.risk_highlights as RiskHighlightLike[] | undefined);

  const violations: NarrativeDriftViolation[] = [];

  for (const msg of envelope.integrity.drift_violations ?? []) {
    violations.push({ code: 'envelope_integrity', message: msg });
  }

  checkRiskHighlights(envelope, riskHighlights, violations);
  checkBlockFactorsSurfaced(envelope, riskHighlights, violations);

  const violation_fingerprint = fingerprintNarrativeDriftViolations(violations);

  return {
    monitor_version: NARRATIVE_DRIFT_MONITOR_VERSION,
    drift_detected: violations.length > 0,
    narrative_anchored: envelope.integrity.narrative_anchored,
    traceability_valid: envelope.integrity.traceability_valid,
    physical_evidence_complete: envelope.integrity.physical_evidence_complete,
    violations,
    violation_count: violations.length,
    narrative_drift_score: narrativeDriftScoreFromViolations(violations),
    violation_fingerprint,
  };
}

export function buildNarrativeDriftObservabilitySlice(
  report: NarrativeDriftReport,
): NarrativeDriftObservabilitySlice {
  const reason_codes = uniq(report.violations.map((v) => v.code));
  const drift_summary_zh = report.drift_detected
    ? `检测到 ${report.violation_count} 项叙事-证据漂移（score=${report.narrative_drift_score.toFixed(2)}）`
    : '叙事与 envelope trace/evidence 一致';

  return {
    schema: NARRATIVE_DRIFT_OBSERVABILITY_SCHEMA,
    monitor_version: report.monitor_version,
    drift_detected: report.drift_detected,
    narrative_anchored: report.narrative_anchored,
    traceability_valid: report.traceability_valid,
    physical_evidence_complete: report.physical_evidence_complete,
    narrative_drift_score: report.narrative_drift_score,
    violation_count: report.violation_count,
    violation_fingerprint: report.violation_fingerprint,
    reason_codes,
    drift_summary_zh,
  };
}

/** 单行 JSON 日志；需 `NARRATIVE_DRIFT_METRICS_LOG=1` */
export function emitNarrativeDriftMetricEvent(params: {
  request_id: string;
  trip_id?: string;
  slice: NarrativeDriftObservabilitySlice;
}): void {
  if (process.env.NARRATIVE_DRIFT_METRICS_LOG !== '1') return;
  const ev: NarrativeDriftMetricEvent = {
    tripnara_metric: 'narrative_drift',
    metric_schema: 'narrative_drift/v1',
    request_id: params.request_id,
    ...(params.trip_id ? { trip_id: params.trip_id } : {}),
    narrative_drift_score: params.slice.narrative_drift_score,
    drift_detected: params.slice.drift_detected,
    violation_count: params.slice.violation_count,
    ...(params.slice.violation_fingerprint
      ? { violation_fingerprint: params.slice.violation_fingerprint }
      : {}),
    reason_codes: params.slice.reason_codes,
  };
  console.log(JSON.stringify(ev));
}

export function parseNarrativeDriftMetricEvents(logText: string): NarrativeDriftMetricEvent[] {
  const events: NarrativeDriftMetricEvent[] = [];
  for (const line of logText.split('\n')) {
    const idx = line.indexOf('"tripnara_metric":"narrative_drift"');
    if (idx < 0) continue;
    const jsonStart = line.indexOf('{', idx - 40 > 0 ? idx - 40 : 0);
    if (jsonStart < 0) continue;
    try {
      const parsed = JSON.parse(line.slice(jsonStart)) as NarrativeDriftMetricEvent;
      if (parsed.tripnara_metric === 'narrative_drift') events.push(parsed);
    } catch {
      // skip malformed
    }
  }
  return events;
}

export function summarizeNarrativeDriftEvents(events: NarrativeDriftMetricEvent[]) {
  const scores = events.map((e) => e.narrative_drift_score).filter(Number.isFinite);
  const driftRate =
    events.length > 0 ? events.filter((e) => e.drift_detected).length / events.length : undefined;
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
  const p90 =
    scores.length > 0
      ? [...scores].sort((a, b) => a - b)[Math.min(scores.length - 1, Math.ceil(0.9 * scores.length) - 1)]
      : undefined;
  return {
    totalEvents: events.length,
    driftDetectedRate: driftRate,
    narrativeDriftScoreAvg: avgScore,
    narrativeDriftScoreP90: p90,
  };
}
