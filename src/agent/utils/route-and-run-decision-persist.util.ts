/**
 * Maps orchestrator `DecisionLogEntry` rows to Trips `DecisionLogEntry` fields when persisting
 * `route_and_run` traces (PRD §13.B: READINESS vs ABU_GATE, enriched reasonCodes).
 */

import type { DecisionLogEntry, OrchestrationStep } from '../interfaces/trip-plan.interface';

export type RouteAndRunPersistAudit = {
  tripRunId?: string;
  planVersion?: number;
};

/**
 * Metadata merged onto Trips decision rows for `route_and_run` persistence (TD-04 / PRD §11.7).
 * Includes redundant `request_id`, optional `tripRunId` / `plan_version` for normalize aux codes `REQ_*`, `TRIPRUN_*`, `PV_*`.
 */
export function buildRouteAndRunTripsPersistMetadata(
  it: DecisionLogEntry,
  audit?: RouteAndRunPersistAudit,
): Record<string, unknown> {
  const meta =
    it.metadata && typeof it.metadata === 'object' ? { ...(it.metadata as Record<string, unknown>) } : {};
  return {
    ...meta,
    ...(typeof it.request_id === 'string' && it.request_id.trim()
      ? { request_id: it.request_id }
      : {}),
    ...(audit?.tripRunId ? { tripRunId: audit.tripRunId } : {}),
    ...(audit?.planVersion !== undefined && audit.planVersion !== null
      ? { plan_version: audit.planVersion }
      : {}),
    route_and_run: {
      request_id: it.request_id,
      step: it.step,
      actor: it.actor,
      inputs_summary: it.inputs_summary,
      outputs_summary: it.outputs_summary,
    },
    ...(Array.isArray(it.ontology_evidence_display_zh) && it.ontology_evidence_display_zh.length
      ? { ontology_evidence_display_zh: it.ontology_evidence_display_zh }
      : {}),
    ...(Array.isArray(it.readiness_evidence_display_zh) && it.readiness_evidence_display_zh.length
      ? { readiness_evidence_display_zh: it.readiness_evidence_display_zh }
      : {}),
    ...(Array.isArray(it.readiness_technical_evidence_refs) && it.readiness_technical_evidence_refs.length
      ? { readiness_technical_evidence_refs: it.readiness_technical_evidence_refs }
      : {}),
  };
}
import type { DecisionStage as TripsDecisionStage } from '../../trips/decision/shared/decision-result.types';

export function resolveTripsStageFromOrchestrationStep(step: OrchestrationStep): TripsDecisionStage {
  const s = String(step ?? '').toUpperCase();
  if (s === 'GATE_EVAL') return 'ABU_GATE';
  if (s === 'REPAIR') return 'SPATIAL_REPAIR';
  if (s === 'VERIFY') return 'FINALIZE';
  if (s === 'PLAN_GEN' || s === 'OPTIMIZE') return 'PLAN_SCORE';
  if (s === 'INTAKE') return 'ROUTE_PICK';
  return 'FINALIZE';
}

/**
 * When inputs come from `readiness.service.generateDecisionLogEntries`, map to `READINESS`
 * instead of folding everything under `GATE_EVAL` → `ABU_GATE`.
 */
export function resolveTripsStageForRouteAndRunPersist(
  it: Pick<DecisionLogEntry, 'inputs_summary' | 'step'>,
): TripsDecisionStage {
  const inputs = String(it.inputs_summary ?? '');
  if (inputs.includes('准备度检查') || inputs.toLowerCase().includes('readiness check')) {
    return 'READINESS';
  }
  return resolveTripsStageFromOrchestrationStep(it.step);
}

export function buildRouteAndRunPersistReasonCodes(
  it: Pick<DecisionLogEntry, 'step' | 'outputs_summary' | 'metadata'>,
): string[] {
  const meta =
    it.metadata && typeof it.metadata === 'object' && !Array.isArray(it.metadata)
      ? (it.metadata as Record<string, unknown>)
      : {};
  const codes: string[] = [String(it.step ?? 'UNKNOWN_STEP')];
  const rid = meta.ruleId ?? meta.rule_id;
  if (typeof rid === 'string' && rid.trim()) {
    const slug = rid
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .slice(0, 80);
    if (slug) codes.push(`RULE_${slug}`);
  }
  const out = typeof it.outputs_summary === 'string' ? it.outputs_summary : '';
  if (out.startsWith('BLOCK:')) codes.push('READINESS_BLOCK');
  if (out.startsWith('ADJUST:')) codes.push('READINESS_MUST_ADJUST');
  const g = meta.guardian;
  if (typeof g === 'string' && g.trim()) {
    codes.push(`GUARDIAN_${String(g).toUpperCase()}`);
  }
  return Array.from(new Set(codes));
}
