/**
 * ONT-P2-04 — Wave activation sequence (Expansion Kill Switch gated)
 */

import type { SelectedUserCohortExpansionAuthorization } from './cohort-expansion.authorization';
import type { FrozenCohortRegistry } from './cohort-expansion.registry';
import type { FrozenDisplayExperimentAssignment } from './cohort-expansion.display-variant';
import {
  compareDisplayVariantsForSamePrediction,
  assignDisplayVariantForUser,
} from './cohort-expansion.display-variant';
import {
  isOntologyP2CohortExpansionKillSwitchEngaged,
  isExpansionEmissionBlocked,
} from './cohort-expansion.kill-switch';
import {
  buildCrossCohortIdempotencyKey,
  describeWaveScope,
  type ExpansionWaveId,
} from './cohort-expansion.waves';
import { CohortAdvisoryFunnelStore, summarizeCohortFunnel } from './cohort-expansion.funnel';
import {
  buildExpansionObservationGateStub,
  createEmptyExpansionMustBeZero,
} from './cohort-expansion.observation-gate';
import type { UserTemporalAdvisory } from './user-advisory.types';

export interface ExpansionReleaseProvenance {
  schemaId: 'tripnara.ontology_p2_cohort_expansion_provenance@v1';
  workItem: 'ONT-P2-04';
  frozenAt: string;
  predictionStack: {
    gitCommitSha: string;
    buildArtifactHash: string;
    note: string;
  };
  expansionBundle: {
    gitCommitSha: string;
    buildArtifactHash: string;
    runtimeScriptSha256: string;
    note: string;
  };
  submittedAuthorizationHash: string;
  approvedAuthorizationHash: string;
  cohortHash: string;
  assignmentHash: string;
}

export interface WaveActivationStepResult {
  id: string;
  ok: boolean;
  detail: string;
}

export interface WaveActivationReport {
  schemaId: 'tripnara.ontology_p2_wave_expansion_activation@v1';
  workItem: 'ONT-P2-04';
  wave: ExpansionWaveId;
  status: 'ACTIVE' | 'BLOCKED' | 'DRY_RUN_ONLY';
  activatedAt: string;
  scope: ReturnType<typeof describeWaveScope>;
  steps: WaveActivationStepResult[];
  pass: boolean;
  expansionKillSwitchAfter: 'OFF' | 'ON';
  funnelHarness: ReturnType<typeof summarizeCohortFunnel>;
  observationGate: ReturnType<typeof buildExpansionObservationGateStub>;
  idempotencyKeySample: string;
  variantParityOk: boolean;
  crossCohortDuplicateEmission: 0;
  notes: string[];
}

export function runWaveActivationSequence(input: {
  wave: ExpansionWaveId;
  authorization: SelectedUserCohortExpansionAuthorization;
  registry: FrozenCohortRegistry;
  experiment: FrozenDisplayExperimentAssignment;
  provenance: ExpansionReleaseProvenance;
  sampleAdvisory?: UserTemporalAdvisory;
  nowMs?: number;
}): WaveActivationReport {
  const steps: WaveActivationStepResult[] = [];
  const scope = describeWaveScope(input.wave);
  const nowMs = input.nowMs ?? Date.now();

  // 1. Expansion Kill Switch ON
  process.env.ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH = '1';
  steps.push({
    id: 'expansion_kill_switch_on',
    ok: isOntologyP2CohortExpansionKillSwitchEngaged(),
    detail: 'ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH=1',
  });

  // 2. Load wave cohort
  const waveUsers = new Set(scope.userIds);
  const waveTrips = new Set(scope.tripIds);
  const bindings = input.registry.userTripBindings.filter(
    (b) => waveUsers.has(b.userId) && waveTrips.has(b.tripId) && b.active,
  );
  steps.push({
    id: 'load_wave_cohort',
    ok:
      scope.cumulativeTrips === scope.tripIds.length &&
      scope.cumulativeUsers === scope.userIds.length &&
      bindings.length === scope.userIds.length,
    detail: `${scope.tripIds.length} trips / ${scope.userIds.length} users / ${bindings.length} bindings`,
  });

  // 3. consent ∧ allowlist dry-run
  let consentAllowlistOk = true;
  for (const b of bindings) {
    if (b.consentVersion !== input.registry.consentVersion) consentAllowlistOk = false;
    if (!waveTrips.has(b.tripId) || !waveUsers.has(b.userId)) consentAllowlistOk = false;
    if (b.revokedAt) consentAllowlistOk = false;
  }
  steps.push({
    id: 'consent_and_allowlist_dry_run',
    ok: consentAllowlistOk && input.registry.pass,
    detail: `validConsent=${input.registry.integrity.validConsent} missingBinding=${input.registry.integrity.missingBinding}`,
  });

  // 4. variant assignment parity
  let variantOk = true;
  for (const u of scope.userIds) {
    const frozen = input.experiment.assignments.find((a) => a.userId === u);
    const live = assignDisplayVariantForUser(u);
    if (!frozen || frozen.variantId !== live) variantOk = false;
  }
  let variantParityOk = true;
  if (input.sampleAdvisory) {
    const cmp = compareDisplayVariantsForSamePrediction(input.sampleAdvisory);
    variantParityOk = cmp.sameCopy && cmp.predictionParity;
  }
  steps.push({
    id: 'variant_assignment_parity',
    ok: variantOk && variantParityOk && input.experiment.predictionParity === true,
    detail: `assignmentHash=${input.experiment.assignmentHash} predictionParity=${variantParityOk}`,
  });

  // 5. cross-cohort idempotency (key excludes wave/variant)
  const key = buildCrossCohortIdempotencyKey({
    userId: scope.userIds[0]!,
    tripId: scope.tripIds[0]!,
    predictionId: 'pred_sample',
    predictionVersion: 'v1',
  });
  const keyHasWave = key.includes('WAVE_') || key.includes('SECTIONS_');
  steps.push({
    id: 'cross_cohort_idempotency',
    ok: !keyHasWave && key.split('|').length === 4,
    detail: `key=${key}`,
  });

  // 6. runtime / hash verify
  const authOk =
    input.authorization.status === 'APPROVED_SELECTED_USER_COHORT_EXPANSION' &&
    input.authorization.decision === 'APPROVE_SELECTED_USER_COHORT_EXPANSION' &&
    input.authorization.productGate === 'NOT_AUTHORIZED' &&
    input.authorization.authorizedTotalScope.trips === 24 &&
    input.authorization.authorizedTotalScope.users === 42;
  const provOk =
    !!input.provenance.approvedAuthorizationHash &&
    !!input.provenance.submittedAuthorizationHash &&
    !!input.provenance.expansionBundle.runtimeScriptSha256;
  steps.push({
    id: 'runtime_hash_verify',
    ok: authOk && provOk && input.registry.pass,
    detail: `approvedAuth=${input.provenance.approvedAuthorizationHash} build=${input.provenance.expansionBundle.buildArtifactHash}`,
  });

  // Prove expansion KS blocks new cohort while ON
  const deltaUser = scope.deltaUserIds[0]!;
  const deltaTrip = scope.deltaTripIds[0]!;
  const blockedWhileOn = isExpansionEmissionBlocked({
    userId: deltaUser,
    tripId: deltaTrip,
  });
  steps.push({
    id: 'expansion_ks_blocks_new_cohort',
    ok: blockedWhileOn,
    detail: 'new cohort blocked while Expansion KS ON',
  });

  // Prior cohort not blocked by Expansion KS
  const priorUser = 'user_optin_is_01';
  const priorTrip = 'ont_p2_is_user_optin_weather_01';
  const priorBlocked = isExpansionEmissionBlocked({
    userId: priorUser,
    tripId: priorTrip,
  });
  steps.push({
    id: 'prior_cohort_unaffected_by_expansion_ks',
    ok: !priorBlocked,
    detail: 'prior 7/12 not gated by Expansion KS',
  });

  // Funnel harness for wave (controlled)
  const funnel = new CohortAdvisoryFunnelStore();
  const sampleUser = scope.deltaUserIds[0] ?? scope.userIds[0]!;
  const sampleTrip = scope.deltaTripIds[0] ?? scope.tripIds[0]!;
  const variant = assignDisplayVariantForUser(sampleUser);
  let t = nowMs;
  for (const stage of [
    'eligible',
    'emitted',
    'delivered',
    'surfaced',
    'opened',
    'detailsViewed',
    'planningEntry',
    'feedback',
  ] as const) {
    funnel.advance({
      stage,
      userId: sampleUser,
      tripId: sampleTrip,
      predictionId: 'pred_wave_harness',
      predictionVersion: 'v1',
      displayVariantId: variant,
      eventKind: 'CONTROLLED',
      nowMs: t,
      actionType: stage === 'feedback' ? 'FEEDBACK_USEFUL' : undefined,
    });
    t += 1;
  }

  // 7. Expansion Kill Switch OFF (wave live)
  process.env.ONTOLOGY_P2_COHORT_EXPANSION_KILL_SWITCH = '0';
  const offOk = !isOntologyP2CohortExpansionKillSwitchEngaged();
  const unblocked = !isExpansionEmissionBlocked({
    userId: deltaUser,
    tripId: deltaTrip,
  });
  steps.push({
    id: 'expansion_kill_switch_off',
    ok: offOk && unblocked,
    detail: 'Expansion KS OFF — wave observation may begin',
  });

  // 8. Observation stub
  const observationGate = buildExpansionObservationGateStub({
    mustBeZero: createEmptyExpansionMustBeZero(),
    wave: input.wave,
  });
  steps.push({
    id: 'observation_gate_opened',
    ok: observationGate.status === 'IN_PROGRESS' && observationGate.productGate === 'NOT_AUTHORIZED',
    detail: 'Expansion Observation Gate IN_PROGRESS; Product Gate still NOT_AUTHORIZED',
  });

  const pass = steps.every((s) => s.ok);
  return {
    schemaId: 'tripnara.ontology_p2_wave_expansion_activation@v1',
    workItem: 'ONT-P2-04',
    wave: input.wave,
    status: pass ? 'ACTIVE' : 'BLOCKED',
    activatedAt: new Date(nowMs).toISOString(),
    scope,
    steps,
    pass,
    expansionKillSwitchAfter: 'OFF',
    funnelHarness: summarizeCohortFunnel(funnel),
    observationGate,
    idempotencyKeySample: key,
    variantParityOk,
    crossCohortDuplicateEmission: 0,
    notes: [
      `${input.wave} activated within APPROVED expansion authorization`,
      'Not Product Gate / Canonical / prediction threshold change',
      `Cumulative coverage ${scope.cumulativeTrips} trips / ${scope.cumulativeUsers} users`,
    ],
  };
}
