/**
 * ONT-P2-02B — freeze Internal Advisory Observation Report
 * ONT-P2-02C — Observation Gate
 * ONT-P2-03A — Selected User Temporal Advisory Authorization (submit on 02C PASS)
 */

import { createHash } from 'crypto';
import {
  P2_02B_OBSERVATION_SCHEMA_ID,
  runInternalAdvisoryObservationPilot,
} from './observation.pilot';
import type { InternalAdvisoryObservationMetrics } from './observation.metrics';

export const P2_02B_FROZEN_OBSERVATION_SCHEMA_ID =
  'tripnara.ontology_p2_internal_advisory_observation_frozen@v1' as const;

export const P2_02C_OBSERVATION_GATE_SCHEMA_ID =
  'tripnara.ontology_p2_observation_gate@v1' as const;

export const P2_03A_SELECTED_USER_AUTH_SCHEMA_ID =
  'tripnara.ontology_p2_selected_user_temporal_advisory_authorization@v1' as const;

export const SELECTED_USER_OPT_IN_TRIP_IDS = [
  'ont_p2_is_user_optin_weather_01',
  'ont_p2_is_user_optin_weather_02',
  'ont_canary_is_wind_01',
] as const;

export interface FrozenInternalAdvisoryObservationReport {
  schemaId: typeof P2_02B_FROZEN_OBSERVATION_SCHEMA_ID;
  workItem: 'ONT-P2-02B';
  frozenAt: string;
  frozenBy: string;
  status: 'FROZEN';
  sourceSchemaId: typeof P2_02B_OBSERVATION_SCHEMA_ID;
  observationVerdict: 'PASS' | 'FAIL';
  replayFingerprint: string;
  freezeFingerprint: string;
  metrics: InternalAdvisoryObservationMetrics;
  checklist: Array<{ id: string; ok: boolean }>;
  faultInjectionAllOk: boolean;
  notes: string[];
}

export interface ObservationGateCheck {
  id: string;
  ok: boolean;
  detail: string;
}

export interface P202CObservationGateReport {
  schemaId: typeof P2_02C_OBSERVATION_GATE_SCHEMA_ID;
  workItem: 'ONT-P2-02C';
  generatedAt: string;
  verdict: 'PASS' | 'FAIL';
  frozenObservation: FrozenInternalAdvisoryObservationReport;
  checks: ObservationGateCheck[];
  nextAllowed: 'SUBMIT_ONT_P2_03A_SELECTED_USER_TEMPORAL_ADVISORY' | 'NONE';
  nextForbidden: Array<
    | 'APPROVE_03A_BEFORE_02C_PASS'
    | 'P2_CANONICAL_AUTHORITY'
    | 'AUTO_ITINERARY_ADJUST'
    | 'WEATHER_ADVISORY_TRIGGERS_BLOCK'
    | 'NON_OPTIN_USER_EMISSION'
  >;
}

export interface SelectedUserTemporalAdvisoryAuthorization {
  schemaId: typeof P2_03A_SELECTED_USER_AUTH_SCHEMA_ID;
  workItem: 'ONT-P2-03A';
  title: 'Selected User Temporal Advisory Authorization';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'BLOCKED_PENDING_02C' | 'REJECTED';
  submittedAt?: string;
  prerequisite: {
    workItem: 'ONT-P2-02C';
    observationGateVerdict: 'PASS' | 'FAIL' | 'PENDING';
    frozenObservationFingerprint?: string;
  };
  scope: {
    destination: 'IS';
    semanticScope: 'WEATHER_DETERIORATION';
    authorityMode: 'SHADOW';
    mode: 'ADVISORY_ONLY';
    audience: 'SELECTED_OPT_IN_USERS_ONLY';
    tripIds: string[];
    /** Explicit opt-in required per trip */
    requiresExplicitOptIn: true;
  };
  permissions: {
    showTemporalAdvisoryToOptInUser: true;
    collectUserFeedback: true;
  };
  prohibitions: {
    mutateConstraintAssessment: true;
    callCanonicalApply: true;
    modifyPlanDirectly: true;
    triggerBlockFromAdvisory: true;
    createPlanRevision: true;
    changeReadyGate: true;
    changeConfirmGate: true;
    changeExecuteGate: true;
    emitToNonOptInUsers: true;
    fullUserRollout: true;
  };
  killSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH';
  canonicalControl: 'FORBIDDEN';
  planMutation: 'FORBIDDEN';
  blockTrigger: 'FORBIDDEN';
  notes: string[];
}

function controlBoundaryAllZero(m: InternalAdvisoryObservationMetrics): boolean {
  return (
    m.canonical_apply_invocation === 0 &&
    m.assessment_mutation === 0 &&
    m.plan_revision_created === 0 &&
    m.ready_gate_changed === 0 &&
    m.confirm_gate_changed === 0 &&
    m.execute_gate_changed === 0 &&
    m.external_user_emission === 0 &&
    m.blocking_notification_emitted === 0 &&
    m.advisory_from_superseded_prediction === 0 &&
    m.advisory_context_revision_mismatch === 0 &&
    m.multiple_active_advisories_same_scope === 0 &&
    m.expired_advisory_visible === 0 &&
    m.withdrawn_advisory_actionable === 0 &&
    m.unresolved_actionable_false_negative === 0 &&
    m.stale_advisory_count === 0 &&
    m.superseded_withdrawal_failure === 0 &&
    m.advisory_prediction_mismatch_count === 0
  );
}

export async function freezeInternalAdvisoryObservationReport(input?: {
  nowMs?: number;
  frozenBy?: string;
}): Promise<FrozenInternalAdvisoryObservationReport> {
  const nowMs = input?.nowMs ?? Date.parse('2026-07-23T19:30:00.000Z');
  const observation = await runInternalAdvisoryObservationPilot({
    nowMs: Date.parse('2026-07-23T08:00:00.000Z'),
  });

  const freezeFingerprint = `frz_02b_${createHash('sha256')
    .update(
      JSON.stringify({
        rp: observation.replayFingerprint,
        verdict: observation.verdict,
        metrics: {
          emitted: observation.metrics.advisory_emitted_count,
          reconciled: observation.metrics.advisory_reconciled_count,
          fbMatch: observation.metrics.feedback_prediction_version_match,
          multi: observation.metrics.multiple_active_advisories_same_scope,
        },
        faults: observation.faultInjections.map((f) => [f.id, f.ok]),
      }),
    )
    .digest('hex')
    .slice(0, 24)}`;

  return {
    schemaId: P2_02B_FROZEN_OBSERVATION_SCHEMA_ID,
    workItem: 'ONT-P2-02B',
    frozenAt: new Date(nowMs).toISOString(),
    frozenBy: input?.frozenBy ?? 'ontology-product-authority',
    status: 'FROZEN',
    sourceSchemaId: P2_02B_OBSERVATION_SCHEMA_ID,
    observationVerdict: observation.verdict,
    replayFingerprint: observation.replayFingerprint,
    freezeFingerprint,
    metrics: observation.metrics,
    checklist: observation.checklist,
    faultInjectionAllOk: observation.faultInjections.every((f) => f.ok),
    notes: [
      'ONT-P2-02B Internal Advisory Observation Report frozen',
      'Input to ONT-P2-02C Observation Gate',
      'Does not approve Selected User Pilot by itself',
    ],
  };
}

export function evaluateP202CObservationGate(input: {
  frozen: FrozenInternalAdvisoryObservationReport;
  nowMs?: number;
}): P202CObservationGateReport {
  const frozen = input.frozen;
  const m = frozen.metrics;
  const checks: ObservationGateCheck[] = [];

  checks.push({
    id: 'OBSERVATION_FROZEN',
    ok: frozen.status === 'FROZEN' && frozen.observationVerdict === 'PASS',
    detail: `status=${frozen.status} verdict=${frozen.observationVerdict}`,
  });

  checks.push({
    id: 'ADVISORY_VERSION_CONSISTENT',
    ok:
      m.advisory_prediction_mismatch_count === 0 &&
      m.stale_advisory_count === 0 &&
      m.superseded_withdrawal_failure === 0 &&
      m.feedback_prediction_version_match > 0 &&
      (m.feedback_completion_rate ?? 0) > 0,
    detail: `fbVersionMatch=${m.feedback_prediction_version_match} mismatch=${m.advisory_prediction_mismatch_count} stale=${m.stale_advisory_count}`,
  });

  checks.push({
    id: 'CONTROL_BOUNDARY_ALL_ZERO',
    ok: controlBoundaryAllZero(m),
    detail: 'canonical/plan/ready/confirm/execute/external/stale/multi-active all zero',
  });

  const unclear = m.unclear_rate ?? 0;
  checks.push({
    id: 'INTERNAL_UNDERSTANDING_NO_OPEN_ISSUES',
    ok:
      unclear <= 0.25 &&
      m.unresolved_actionable_false_negative === 0 &&
      frozen.faultInjectionAllOk &&
      frozen.checklist.every((c) => c.ok),
    detail: `unclear_rate=${unclear} afn_unresolved=${m.unresolved_actionable_false_negative}`,
  });

  const feedbackComplete =
    m.feedback_completion_rate != null && m.feedback_completion_rate >= 0.4;
  const reconComplete = m.advisory_reconciled_count >= 5;
  checks.push({
    id: 'FEEDBACK_AND_RECONCILIATION_COMPLETE',
    ok: feedbackComplete && reconComplete && m.advisory_emitted_count >= 20,
    detail: `feedback_completion=${m.feedback_completion_rate} reconciled=${m.advisory_reconciled_count} emitted=${m.advisory_emitted_count}`,
  });

  checks.push({
    id: 'FREEZE_FINGERPRINT_STABLE',
    ok: frozen.freezeFingerprint.startsWith('frz_02b_'),
    detail: frozen.freezeFingerprint,
  });

  const verdict = checks.every((c) => c.ok) ? 'PASS' : 'FAIL';

  return {
    schemaId: P2_02C_OBSERVATION_GATE_SCHEMA_ID,
    workItem: 'ONT-P2-02C',
    generatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    verdict,
    frozenObservation: frozen,
    checks,
    nextAllowed:
      verdict === 'PASS'
        ? 'SUBMIT_ONT_P2_03A_SELECTED_USER_TEMPORAL_ADVISORY'
        : 'NONE',
    nextForbidden: [
      'APPROVE_03A_BEFORE_02C_PASS',
      'P2_CANONICAL_AUTHORITY',
      'AUTO_ITINERARY_ADJUST',
      'WEATHER_ADVISORY_TRIGGERS_BLOCK',
      'NON_OPTIN_USER_EMISSION',
    ],
  };
}

export function submit03ASelectedUserTemporalAdvisoryAuthorization(input: {
  observationGate: P202CObservationGateReport;
  nowMs?: number;
}): SelectedUserTemporalAdvisoryAuthorization {
  if (input.observationGate.verdict !== 'PASS') {
    return {
      schemaId: P2_03A_SELECTED_USER_AUTH_SCHEMA_ID,
      workItem: 'ONT-P2-03A',
      title: 'Selected User Temporal Advisory Authorization',
      status: 'BLOCKED_PENDING_02C',
      prerequisite: {
        workItem: 'ONT-P2-02C',
        observationGateVerdict: input.observationGate.verdict,
      },
      scope: {
        destination: 'IS',
        semanticScope: 'WEATHER_DETERIORATION',
        authorityMode: 'SHADOW',
        mode: 'ADVISORY_ONLY',
        audience: 'SELECTED_OPT_IN_USERS_ONLY',
        tripIds: [...SELECTED_USER_OPT_IN_TRIP_IDS],
        requiresExplicitOptIn: true,
      },
      permissions: {
        showTemporalAdvisoryToOptInUser: true,
        collectUserFeedback: true,
      },
      prohibitions: {
        mutateConstraintAssessment: true,
        callCanonicalApply: true,
        modifyPlanDirectly: true,
        triggerBlockFromAdvisory: true,
        createPlanRevision: true,
        changeReadyGate: true,
        changeConfirmGate: true,
        changeExecuteGate: true,
        emitToNonOptInUsers: true,
        fullUserRollout: true,
      },
      killSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
      canonicalControl: 'FORBIDDEN',
      planMutation: 'FORBIDDEN',
      blockTrigger: 'FORBIDDEN',
      notes: ['Blocked until ONT-P2-02C Observation Gate PASS'],
    };
  }

  return {
    schemaId: P2_03A_SELECTED_USER_AUTH_SCHEMA_ID,
    workItem: 'ONT-P2-03A',
    title: 'Selected User Temporal Advisory Authorization',
    status: 'SUBMITTED',
    submittedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    prerequisite: {
      workItem: 'ONT-P2-02C',
      observationGateVerdict: 'PASS',
      frozenObservationFingerprint:
        input.observationGate.frozenObservation.freezeFingerprint,
    },
    scope: {
      destination: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      authorityMode: 'SHADOW',
      mode: 'ADVISORY_ONLY',
      audience: 'SELECTED_OPT_IN_USERS_ONLY',
      tripIds: [...SELECTED_USER_OPT_IN_TRIP_IDS],
      requiresExplicitOptIn: true,
    },
    permissions: {
      showTemporalAdvisoryToOptInUser: true,
      collectUserFeedback: true,
    },
    prohibitions: {
      mutateConstraintAssessment: true,
      callCanonicalApply: true,
      modifyPlanDirectly: true,
      triggerBlockFromAdvisory: true,
      createPlanRevision: true,
      changeReadyGate: true,
      changeConfirmGate: true,
      changeExecuteGate: true,
      emitToNonOptInUsers: true,
      fullUserRollout: true,
    },
    killSwitchEnv: 'ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
    canonicalControl: 'FORBIDDEN',
    planMutation: 'FORBIDDEN',
    blockTrigger: 'FORBIDDEN',
    notes: [
      'Selected User Temporal Advisory — explicit Opt-in Iceland trips only',
      'SHADOW + advisory-only',
      'Does not modify plan, does not trigger BLOCK, does not call Canonical Apply',
      'Independent user display kill switch: ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH',
      'Awaiting separate approval — not auto-APPROVED by 02C',
    ],
  };
}

/** Independent user-facing advisory display kill switch (canonical impl in selected-user-advisory) */
export { isOntologyP2UserAdvisoryKillSwitchEngaged } from '../selected-user-advisory/user-advisory.kill-switch';

export async function runP202CObservationGateAndSubmit03A(input?: {
  nowMs?: number;
}): Promise<{
  frozen: FrozenInternalAdvisoryObservationReport;
  gate: P202CObservationGateReport;
  authorization03a: SelectedUserTemporalAdvisoryAuthorization;
}> {
  const frozen = await freezeInternalAdvisoryObservationReport({
    nowMs: input?.nowMs ?? Date.parse('2026-07-23T19:30:00.000Z'),
  });
  const gate = evaluateP202CObservationGate({
    frozen,
    nowMs: input?.nowMs ?? Date.parse('2026-07-23T19:35:00.000Z'),
  });
  const authorization03a = submit03ASelectedUserTemporalAdvisoryAuthorization({
    observationGate: gate,
    nowMs: input?.nowMs ?? Date.parse('2026-07-23T19:40:00.000Z'),
  });
  return { frozen, gate, authorization03a };
}
