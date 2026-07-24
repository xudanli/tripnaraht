/**
 * ONT-P2-03A — activation sequence:
 * Step1 Kill Switch ON + eligibility matrix
 * Step2 dry-run audit
 * Step3 Kill Switch OFF only after dry-run PASS
 */

import type { SelectedUserTemporalAdvisoryAuthorizationApproved } from './authorization';
import type { UserOptInConsentStore } from './consent.store';
import {
  auditUserAdvisoryDryRun,
  type DryRunCandidate,
  type UserAdvisoryDryRunReport,
} from './user-advisory.dry-run';
import {
  emitUserTemporalAdvisory,
  evaluateUserAdvisoryEligibility,
  type EmitUserAdvisoryContext,
} from './user-advisory.emitter';
import { isOntologyP2UserAdvisoryKillSwitchEngaged } from './user-advisory.kill-switch';
import type { UserAdvisoryStore } from './user-advisory.store';
import type { PredictionRecord } from '../contracts';

export interface ActivationMatrixCase {
  id: string;
  label: string;
  tripId: string;
  userId: string;
  destination: string;
  semanticScope: string;
  optedIn: boolean;
  prediction: PredictionRecord;
  expectEligible: boolean;
  expectEmitWithKillOn: false;
  expectEmitWithKillOff: boolean;
}

export interface ActivationStep1Report {
  killSwitchEngaged: true;
  cases: Array<{
    id: string;
    eligible: boolean;
    emitResult: 'SILENT' | 'EMITTED' | 'SKIPPED';
    skippedReason?: string;
    ok: boolean;
  }>;
  pass: boolean;
}

export interface ActivationRuntimeVerify {
  authorityMode: 'SHADOW';
  deliveryMode: 'ADVISORY_ONLY';
  selectedUserEmission: 'enabled' | 'disabled';
  canonicalControl: false;
  selectedTripCount: number;
  optInUserCount: number;
  killSwitchEngaged: boolean;
}

export function runActivationStep1KillSwitchOn(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  store: UserAdvisoryStore;
  cases: ActivationMatrixCase[];
  baseCtx: Omit<EmitUserAdvisoryContext, 'userId' | 'destination' | 'semanticScope'>;
}): ActivationStep1Report {
  if (!isOntologyP2UserAdvisoryKillSwitchEngaged()) {
    throw new Error('Step1 requires ONTOLOGY_P2_USER_ADVISORY_KILL_SWITCH=1');
  }

  const cases = input.cases.map((c) => {
    // Ensure consent store reflects case (AND semantics tested via eligibility)
    const gate = evaluateUserAdvisoryEligibility({
      authorization: input.authorization,
      consent: input.consent,
      tripId: c.tripId,
      userId: c.userId,
      destination: c.destination,
      semanticScope: c.semanticScope,
      prediction: c.prediction,
      nowMs: input.baseCtx.nowMs,
    });

    const emitted = emitUserTemporalAdvisory({
      authorization: input.authorization,
      consent: input.consent,
      prediction: { ...c.prediction, tripId: c.tripId },
      store: input.store,
      ctx: {
        ...input.baseCtx,
        userId: c.userId,
        destination: c.destination,
        semanticScope: c.semanticScope,
      },
    });

    const emitResult: 'SILENT' | 'EMITTED' | 'SKIPPED' =
      'advisory' in emitted
        ? 'EMITTED'
        : emitted.skipped === 'USER_ADVISORY_KILL_SWITCH'
          ? 'SILENT'
          : 'SKIPPED';

    const ok =
      gate.eligible === c.expectEligible &&
      emitResult !== 'EMITTED' &&
      (c.expectEligible
        ? emitResult === 'SILENT'
        : emitResult === 'SKIPPED' || emitResult === 'SILENT');

    return {
      id: c.id,
      eligible: gate.eligible,
      emitResult,
      skippedReason: 'skipped' in emitted ? emitted.skipped : undefined,
      ok,
    };
  });

  return {
    killSwitchEngaged: true,
    cases,
    pass: cases.every((x) => x.ok),
  };
}

export function runActivationStep2DryRun(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  candidates: DryRunCandidate[];
  nowMs?: number;
}): UserAdvisoryDryRunReport {
  return auditUserAdvisoryDryRun(input);
}

export function verifyActivationStep3Runtime(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  killSwitchMustBeOff: boolean;
}): ActivationRuntimeVerify {
  const kill = isOntologyP2UserAdvisoryKillSwitchEngaged();
  if (input.killSwitchMustBeOff && kill) {
    throw new Error('Step3 expects Kill Switch OFF');
  }
  return {
    authorityMode: 'SHADOW',
    deliveryMode: 'ADVISORY_ONLY',
    selectedUserEmission: kill ? 'disabled' : 'enabled',
    canonicalControl: false,
    selectedTripCount: input.authorization.approvedTripIds.length,
    optInUserCount: input.authorization.approvedUserIds.length,
    killSwitchEngaged: kill,
  };
}
