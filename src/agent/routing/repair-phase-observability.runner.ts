/**
 * REPAIR 阶段 Decision OS 审计可观测（从 ClaudeOrchestrator 迁出）。
 */

import type { RepairPhaseObservabilityHost } from './repair-phase-observability.host';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { AuditReportGenerator } from '../utils/terminal-audit-report.generator';
import { normalizeDecisionOsAuditContract } from '../contracts/decision-os-audit.contract';
import { buildAxiomMatchContext } from '../axioms/build-axiom-match-context.util';
import { matchAxioms, pickDominantAxiom } from '../axioms/axiom-matchers';
import {
  axiomMatchSourceForMetrics,
  normalizeAxiomCidForMetrics,
} from '../axioms/axiom-prometheus.util';

export async function recordRepairPhaseObservability(
  host: RepairPhaseObservabilityHost,
  params: {
    newState: DecisionState;
    state: OrchestratorState;
    request: RouteAndRunRequestDto;
  },
): Promise<void> {
  const { newState, state, request } = params;
  try {
    const audit_report = AuditReportGenerator.generate(newState, state);
    const normalizedContract = normalizeDecisionOsAuditContract(audit_report);
    const normalizedAudit = host.normalizeDecisionOsAuditReport(normalizedContract.audit_report);
    if (normalizedContract.violations.length > 0) {
      for (const v of normalizedContract.violations) {
        host.promMetrics?.recordDecisionOsAuditContractViolation({
          stage: 'REPAIR',
          field: v.field,
          reason: v.reason,
        });
      }
    }
    const score = normalizedAudit.session_consistency_score;
    const domAxiom = pickDominantAxiom(
      matchAxioms(
        buildAxiomMatchContext({
          message: request?.message ?? (state as any)?.trip_plan_request?.message,
          constraints: (state as any)?.trip_plan_request?.constraints,
          trip: (state as any)?.trip_plan_request,
          tripId: (state as any)?.trip_plan_request?.trip_id,
          itinerary: (state as any)?.itinerary,
          routeAndRunIntent: (state.metadata as Record<string, unknown>)?.route_and_run_intent as any,
          clarificationAnswers: (state.metadata as Record<string, unknown>)?.clarification_answers as any,
        }),
      ),
    );
    const expectedCid = domAxiom?.axiom?.cid;
    const actualCid = normalizedAudit.dominant_cid;
    const axiomMatchSource = axiomMatchSourceForMetrics(domAxiom);
    host.promMetrics?.recordSessionConsistencyScore({
      score,
      axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
      cid: actualCid ?? expectedCid ?? 'UNKNOWN',
      terminal: false,
    });

    const hasRealTraces =
      Array.isArray((audit_report as any)?.repair_traces) && (audit_report as any).repair_traces.length > 0;
    if (hasRealTraces || typeof score === 'number') {
      const deltaReason = normalizedAudit.delta_reason;
      const deltaUtility = normalizedAudit.delta_utility;
      const delta_reason_kind =
        deltaReason === 'aligned'
          ? ('aligned' as const)
          : deltaReason
            ? ('mismatch' as const)
            : ('unknown' as const);
      const is_intent_revised = normalizedAudit.intent_revision_flag;
      const utility_drift_severity = (() => {
        if (!Number.isFinite(deltaUtility)) return 'unknown' as const;
        const a = Math.abs(deltaUtility);
        if (a <= 5) return 'low' as const;
        if (a <= 20) return 'medium' as const;
        return 'high' as const;
      })();

      try {
        if (domAxiom?.axiom_id && expectedCid && actualCid && expectedCid !== actualCid) {
          host.promMetrics?.recordAxiomDominantCidMismatch({
            axiom_id: domAxiom.axiom_id,
            expected_cid: normalizeAxiomCidForMetrics(expectedCid),
            actual_cid: normalizeAxiomCidForMetrics(actualCid),
            stage: 'REPAIR',
            match_source: axiomMatchSource,
          });
        }
        if (delta_reason_kind === 'mismatch') {
          host.promMetrics?.recordAxiomSimRealMismatch({
            axiom_id: domAxiom?.axiom_id ?? 'UNKNOWN',
            expected_cid: normalizeAxiomCidForMetrics(expectedCid),
            actual_cid: normalizeAxiomCidForMetrics(actualCid),
            stage: 'REPAIR',
            match_source: axiomMatchSource,
            severity: domAxiom?.axiom?.severity ?? 'UNKNOWN',
          });
        }
      } catch {
        // best-effort only
      }

      host.logger.log(
        JSON.stringify({
          event: 'decision_os_audit_report',
          phase: 'REPAIR',
          terminal: false,
          request_id: state.request_id,
          dominant_cid: normalizedAudit.dominant_cid,
          session_consistency_score: normalizedAudit.session_consistency_score,
          delta_reason_kind,
          is_intent_revised,
          utility_drift_severity,
          audit_report: normalizedAudit.audit_report,
        }),
      );
    }
  } catch {
    // best-effort only
  }
}
