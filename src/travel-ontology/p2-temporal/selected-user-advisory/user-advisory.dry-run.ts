/**
 * ONT-P2-03A — dry-run auditor (AND of allowlist + consent; never OR)
 */

import type { PredictionRecord } from '../contracts';
import type { SelectedUserTemporalAdvisoryAuthorizationApproved } from './authorization';
import {
  isApprovedSelectedTrip,
  isApprovedSelectedUser,
  UserOptInConsentStore,
} from './consent.store';
import { isOntologyP2UserAdvisoryKillSwitchEngaged } from './user-advisory.kill-switch';
import type { UserAdvisoryDryRunAudit } from './user-advisory.types';

export interface DryRunCandidate {
  candidateId: string;
  tripId: string;
  userId: string;
  destination: 'IS' | string;
  semanticScope: 'WEATHER_DETERIORATION' | string;
  prediction: PredictionRecord;
  contextRevision: number;
  predictionActive: boolean;
  /** P1 outcome — checked so we never weaken BLOCK in projection */
  p1CanonicalOutcome?: string;
}

export interface UserAdvisoryDryRunReport {
  audits: UserAdvisoryDryRunAudit[];
  summary: {
    nonSelectedWouldEmit: number;
    nonOptInWouldEmit: number;
    supersededWouldEmit: number;
    expiredWouldEmit: number;
    canonicalBlockWeakened: number;
    eligibleWouldEmit: number;
    killSwitchSilentEligible: number;
  };
  pass: boolean;
}

export function auditUserAdvisoryDryRun(input: {
  authorization: SelectedUserTemporalAdvisoryAuthorizationApproved;
  consent: UserOptInConsentStore;
  candidates: DryRunCandidate[];
  nowMs?: number;
}): UserAdvisoryDryRunReport {
  const nowMs = input.nowMs ?? Date.now();
  const killOn = isOntologyP2UserAdvisoryKillSwitchEngaged();
  const audits: UserAdvisoryDryRunAudit[] = [];

  let nonSelectedWouldEmit = 0;
  let nonOptInWouldEmit = 0;
  let supersededWouldEmit = 0;
  let expiredWouldEmit = 0;
  let canonicalBlockWeakened = 0;
  let eligibleWouldEmit = 0;
  let killSwitchSilentEligible = 0;

  for (const c of input.candidates) {
    const tripMatched =
      isApprovedSelectedTrip(c.tripId) &&
      input.authorization.approvedTripIds.includes(c.tripId);
    const userAllowlisted =
      isApprovedSelectedUser(c.userId) &&
      input.authorization.approvedUserIds.includes(c.userId);
    const consentMatched = input.consent.hasValidOptIn(c.userId, c.tripId);
    const destinationOk = c.destination === 'IS';
    const semanticOk = c.semanticScope === 'WEATHER_DETERIORATION';
    const predictionShadow = c.prediction.authorityMode === 'SHADOW';
    const contextRevisionMatched =
      Number.isFinite(c.contextRevision) && c.contextRevision >= 0;

    const deadline = c.prediction.interventionDeadline?.interventionDeadline;
    const deadlineMs = deadline ? Date.parse(deadline) : NaN;
    const expired = Number.isFinite(deadlineMs) && deadlineMs < nowMs;

    // AND not OR: trip allowlist ∧ user allowlist ∧ consent ∧ scope
    const eligible =
      tripMatched &&
      userAllowlisted &&
      consentMatched &&
      destinationOk &&
      semanticOk &&
      predictionShadow &&
      c.predictionActive &&
      contextRevisionMatched &&
      !expired;

    let blockedReason: string | undefined;
    if (!destinationOk) blockedReason = 'NON_ICELAND_TRIP';
    else if (!semanticOk) blockedReason = 'OTHER_SEMANTIC';
    else if (!tripMatched) blockedReason = 'TRIP_NOT_SELECTED';
    else if (!userAllowlisted) blockedReason = 'USER_NOT_SELECTED';
    else if (!consentMatched) blockedReason = 'CONSENT_NOT_MATCHED';
    else if (!c.predictionActive) blockedReason = 'PREDICTION_NOT_ACTIVE';
    else if (!predictionShadow) blockedReason = 'PREDICTION_NOT_SHADOW';
    else if (!contextRevisionMatched) blockedReason = 'CONTEXT_REVISION_MISMATCH';
    else if (expired) blockedReason = 'DEADLINE_EXPIRED';

    const canonicalConflictChecked = true;
    // Dry-run wouldEmit = eligibility if Kill Switch were OFF (boundary proof)
    const wouldEmit = eligible;
    if (eligible && killOn) {
      killSwitchSilentEligible += 1;
    }

    if (!tripMatched && wouldEmit) nonSelectedWouldEmit += 1;
    if ((!consentMatched || !userAllowlisted) && wouldEmit) nonOptInWouldEmit += 1;
    if (!c.predictionActive && wouldEmit) supersededWouldEmit += 1;
    if (expired && wouldEmit) expiredWouldEmit += 1;

    // Softening P1 BLOCK into optional advice is forbidden; dry-run flags if claimed
    if (c.p1CanonicalOutcome === 'BLOCK' && (c as { softensBlock?: boolean }).softensBlock) {
      canonicalBlockWeakened += 1;
    }

    if (eligible) eligibleWouldEmit += 1;

    audits.push({
      candidateId: c.candidateId,
      tripId: c.tripId,
      userId: c.userId,
      predictionId: c.prediction.predictionId,
      eligible,
      consentMatched,
      tripMatched,
      predictionActive: c.predictionActive,
      contextRevisionMatched,
      canonicalConflictChecked,
      wouldEmit,
      blockedReason: eligible && killOn ? 'USER_ADVISORY_KILL_SWITCH_RUNTIME' : blockedReason,
    });
  }

  const pass =
    nonSelectedWouldEmit === 0 &&
    nonOptInWouldEmit === 0 &&
    supersededWouldEmit === 0 &&
    expiredWouldEmit === 0 &&
    canonicalBlockWeakened === 0;

  return {
    audits,
    summary: {
      nonSelectedWouldEmit,
      nonOptInWouldEmit,
      supersededWouldEmit,
      expiredWouldEmit,
      canonicalBlockWeakened,
      eligibleWouldEmit,
      killSwitchSilentEligible,
    },
    pass,
  };
}
