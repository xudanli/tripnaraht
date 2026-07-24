/**
 * Orchestrator decision_log → trips DecisionLogEntry（explain 与 persist 共享）。
 */

import type {
  DecisionAction,
  DecisionLogEntry as TripsDecisionLogEntry,
  DecisionPersona,
  DecisionSource,
} from '../../trips/decision/shared/decision-result.types';
import type { DecisionLogEntry as AgentDecisionLogEntry } from '../interfaces/trip-plan.interface';
import {
  buildRouteAndRunPersistReasonCodes,
  buildRouteAndRunTripsPersistMetadata,
  resolveTripsStageForRouteAndRunPersist,
} from './route-and-run-decision-persist.util';

export function resolveTripsPersonaFromAgentLog(log: AgentDecisionLogEntry): DecisionPersona {
  const g = String((log.metadata as Record<string, unknown> | undefined)?.guardian ?? '').toUpperCase();
  if (g === 'ABU' || g === 'DR_DRE' || g === 'NEPTUNE') return g as DecisionPersona;
  const actor = String(log.actor ?? '');
  if (actor === 'Gatekeeper') return 'ABU';
  if (actor === 'LocalInsight') return 'NEPTUNE';
  if (actor === 'CoreDecision') return 'DR_DRE';
  return 'USER_ACTION';
}

export function resolveTripsActionFromAgentLog(
  log: AgentDecisionLogEntry,
  forExplain = false,
): DecisionAction {
  if (!forExplain) return 'EVALUATE';
  const out = String(log.outputs_summary ?? '');
  if (log.step === 'REPAIR') return 'REPLACE';
  if (out.startsWith('BLOCK:') || /\bREJECT\b/i.test(out)) return 'REJECT';
  return 'ALLOW';
}

export function resolveTripsDecisionSourceFromAgentLog(
  log: AgentDecisionLogEntry,
  forExplain = false,
): DecisionSource {
  if (!forExplain) return 'HEURISTIC';
  const hasEvidence = Array.isArray(log.evidence_refs) && log.evidence_refs.length > 0;
  const step = String(log.step ?? '').toUpperCase();
  const inputs = String(log.inputs_summary ?? '');
  if (hasEvidence && (step === 'GATE_EVAL' || step === 'REPAIR' || step === 'VERIFY')) {
    return 'PHYSICAL';
  }
  if (inputs.includes('准备度') || inputs.toLowerCase().includes('readiness')) {
    return 'PHYSICAL';
  }
  if (step === 'PLAN_GEN' || step === 'OPTIMIZE') return 'UTILITY';
  return 'HEURISTIC';
}

export type MapOrchestrationDecisionLogOptions = {
  forExplain?: boolean;
  tripRunId?: string;
  planVersion?: number;
};

export function mapOrchestrationDecisionLogToTrips(
  entries: AgentDecisionLogEntry[],
  options?: MapOrchestrationDecisionLogOptions,
): TripsDecisionLogEntry[] {
  const forExplain = options?.forExplain === true;
  const out: TripsDecisionLogEntry[] = [];
  for (const it of entries ?? []) {
    if (!it || typeof it !== 'object') continue;
    const ts = typeof it.timestamp === 'string' ? it.timestamp : new Date().toISOString();
    const persistMeta = buildRouteAndRunTripsPersistMetadata(it, {
      tripRunId: options?.tripRunId,
      planVersion: options?.planVersion,
    });
    out.push({
      persona: resolveTripsPersonaFromAgentLog(it),
      action: resolveTripsActionFromAgentLog(it, forExplain),
      explanation: String(it.outputs_summary ?? it.inputs_summary ?? '').slice(0, 4000),
      reasonCodes: buildRouteAndRunPersistReasonCodes(it),
      evidenceRefs: Array.isArray(it.evidence_refs) ? it.evidence_refs.map((x) => String(x)) : [],
      timestamp: ts,
      decisionSource: resolveTripsDecisionSourceFromAgentLog(it, forExplain),
      decisionStage: resolveTripsStageForRouteAndRunPersist(it),
      metadata: persistMeta,
    });
  }
  return out;
}
