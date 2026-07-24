/**
 * ONT-P2-01 — Shadow Gate evaluation + Authorization submit/approve
 */

import { evaluateP2Gate0Offline } from '../gate0/evaluate-p2-gate0-offline';
import { getWeatherShadowSelectedTripIds } from './weather-shadow-selected-trips';
import { isOntologyP2WeatherShadowKillSwitchEngaged } from './weather-shadow.kill-switch';
import { runWeatherShadowProductionPilot } from './weather-shadow-production-pilot';
import type { WeatherShadowPilotAuthorization } from './weather-shadow-pilot.types';
import type { Gate0Check } from '../gate0/evaluate-p2-gate0-offline';

export const P2_SHADOW_GATE_SCHEMA_ID =
  'tripnara.ontology_p2_weather_shadow_gate@v1' as const;

export interface P2ShadowGateReport {
  schemaId: typeof P2_SHADOW_GATE_SCHEMA_ID;
  workItem: 'ONT-P2-01';
  generatedAt: string;
  verdict: 'PASS' | 'FAIL';
  checks: Gate0Check[];
  pilotReplayFingerprint: string;
  gate0Verdict: 'PASS' | 'FAIL';
  nextAllowed: 'USER_FACING_TEMPORAL_ADVICE_REQUIRES_SEPARATE_GATE';
  nextForbidden: Array<
    | 'USER_FACING_TEMPORAL_ADVICE'
    | 'ADD_FOURTH_CONTINUOUS_SEMANTIC'
    | 'MUTATE_CANONICAL_ASSESSMENT'
    | 'CALL_CANONICAL_APPLY'
  >;
}

export function buildWeatherShadowPilotAuthorization(status: {
  status: WeatherShadowPilotAuthorization['status'];
  submittedAt?: string;
  approvedAt?: string;
  approver?: string;
}): WeatherShadowPilotAuthorization {
  return {
    schemaId: 'tripnara.ontology_p2_weather_shadow_pilot_authorization@v1',
    workItem: 'ONT-P2-01',
    title: 'Weather Production Shadow Pilot',
    status: status.status,
    submittedAt: status.submittedAt,
    approvedAt: status.approvedAt,
    approver: status.approver,
    scope: {
      country: 'IS',
      semanticScope: 'WEATHER_DETERIORATION',
      authorityMode: 'SHADOW',
      tripIds: getWeatherShadowSelectedTripIds(),
    },
    permissions: {
      readTravelWorldFact: true,
      readContextRevision: true,
      readRouteAndVehicle: true,
      emitShadowPrediction: true,
      onlineOutcomeReconciliation: true,
      productionReplayExport: true,
    },
    prohibitions: {
      mutateConstraintAssessment: true,
      mutatePlanRevision: true,
      controlReady: true,
      controlConfirm: true,
      controlExecute: true,
      callCanonicalApply: true,
      userFacingTemporalAdvice: true,
      addFourthContinuousSemantic: true,
    },
    killSwitchEnv: 'ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH',
    prerequisiteGate0: 'PASS',
    notes: [
      'SHADOW only — does not modify P0/P1 Canonical Assessment or Plan Revision',
      'Does not control READY / Confirm / Execute',
      'Does not call OntologyCanonicalApply',
      'No user-facing temporal advice until a separate gate after Shadow Gate PASS',
      'No fourth continuous semantic',
    ],
  };
}

export function submitWeatherShadowPilotAuthorization(nowMs?: number): WeatherShadowPilotAuthorization {
  return buildWeatherShadowPilotAuthorization({
    status: 'SUBMITTED',
    submittedAt: new Date(nowMs ?? Date.now()).toISOString(),
  });
}

export function approveWeatherShadowPilotAuthorization(input: {
  submitted: WeatherShadowPilotAuthorization;
  approver?: string;
  nowMs?: number;
}): WeatherShadowPilotAuthorization {
  if (input.submitted.status !== 'SUBMITTED') {
    throw new Error('ONT-P2-01: authorization must be SUBMITTED before approve');
  }
  return {
    ...input.submitted,
    status: 'APPROVED',
    approvedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    approver: input.approver ?? 'ontology-product-authority',
  };
}

export async function evaluateP2WeatherShadowGate(input?: {
  nowMs?: number;
}): Promise<P2ShadowGateReport> {
  const nowMs = input?.nowMs ?? Date.parse('2026-07-23T18:00:00.000Z');
  const gate0 = evaluateP2Gate0Offline({ nowMs });
  const { report } = await runWeatherShadowProductionPilot({ nowMs });
  const checks: Gate0Check[] = [];

  checks.push({
    id: 'GATE0_PASS',
    ok: gate0.verdict === 'PASS',
    detail: `gate0=${gate0.verdict}`,
  });

  checks.push({
    id: 'SCOPE_IS_WEATHER_SHADOW',
    ok:
      report.country === 'IS' &&
      report.semanticScope === 'WEATHER_DETERIORATION' &&
      report.authorityMode === 'SHADOW',
    detail: 'IS + WEATHER_DETERIORATION + SHADOW',
  });

  checks.push({
    id: 'SELECTED_TRIPS_ONLY',
    ok: report.ticks.every(
      (t) =>
        t.skipped?.reason === 'TRIP_NOT_SELECTED' ||
        getWeatherShadowSelectedTripIds().includes(t.tripId),
    ),
    detail: `selected=${report.selectedTripIds.length}`,
  });

  checks.push({
    id: 'VERSION_SUPERSESSION',
    ok: report.controlBoundaryTotals.supersessions >= 1,
    detail: `supersessions=${report.controlBoundaryTotals.supersessions}`,
  });

  checks.push({
    id: 'ONLINE_RECONCILIATION',
    ok: report.controlBoundaryTotals.reconciliations >= 1,
    detail: `reconciliations=${report.controlBoundaryTotals.reconciliations}`,
  });

  checks.push({
    id: 'CONTROL_BOUNDARY_CLEAN',
    ok:
      report.controlBoundaryTotals.boundaryViolated === false &&
      report.controlBoundaryTotals.canonicalApplyCalls === 0 &&
      report.controlBoundaryTotals.constraintAssessmentMutations === 0 &&
      report.controlBoundaryTotals.planRevisionMutations === 0 &&
      report.controlBoundaryTotals.readyControls === 0 &&
      report.controlBoundaryTotals.confirmControls === 0 &&
      report.controlBoundaryTotals.executeControls === 0 &&
      report.controlBoundaryTotals.userFacingTemporalAdviceEmitted === 0 &&
      report.controlBoundaryTotals.fourthSemanticAdded === 0,
    detail: 'all control counters zero',
  });

  checks.push({
    id: 'REPLAY_FINGERPRINT',
    ok: report.replayFingerprint.startsWith('rp_p2_wx_shadow_'),
    detail: report.replayFingerprint,
  });

  checks.push({
    id: 'KILL_SWITCH_OFF_DURING_PILOT',
    ok: report.killSwitchEngaged === false && !isOntologyP2WeatherShadowKillSwitchEngaged(),
    detail: 'kill switch not engaged for gate run',
  });

  // Kill switch drill (separate env mutation restored after)
  const prev = process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
  process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH = '1';
  const killed = await runWeatherShadowProductionPilot({ nowMs });
  if (prev === undefined) delete process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH;
  else process.env.ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH = prev;

  checks.push({
    id: 'KILL_SWITCH_DRILL',
    ok: killed.report.ticks.every(
      (t) => t.skipped?.reason === 'KILL_SWITCH' || t.skipped?.reason === 'TRIP_NOT_SELECTED',
    ),
    detail: 'kill switch skips prediction ticks',
  });

  const verdict = checks.every((c) => c.ok) ? 'PASS' : 'FAIL';

  return {
    schemaId: P2_SHADOW_GATE_SCHEMA_ID,
    workItem: 'ONT-P2-01',
    generatedAt: new Date(nowMs).toISOString(),
    verdict,
    checks,
    pilotReplayFingerprint: report.replayFingerprint,
    gate0Verdict: gate0.verdict,
    nextAllowed: 'USER_FACING_TEMPORAL_ADVICE_REQUIRES_SEPARATE_GATE',
    nextForbidden: [
      'USER_FACING_TEMPORAL_ADVICE',
      'ADD_FOURTH_CONTINUOUS_SEMANTIC',
      'MUTATE_CANONICAL_ASSESSMENT',
      'CALL_CANONICAL_APPLY',
    ],
  };
}
