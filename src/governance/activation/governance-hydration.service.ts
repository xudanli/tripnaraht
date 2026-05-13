import { Injectable } from '@nestjs/common';
import { GovernanceLedgerStoreService } from '../../agent/ledger/governance-ledger.store.service';
import { compactGovernanceSnapshot } from '../snapshot/compact-governance-snapshot.util';
import { applyHeuristicBlockResolutions } from './apply-heuristic-block-resolution.util';
import { buildGovernancePressureField } from './build-governance-pressure-field.util';
import { deriveGovernanceActivationsFromGovernance } from './derive-governance-activations.util';
import type { HydrateGovernanceSnapshotOptions, HydratedGovernanceRuntimeContext } from './governance-activation.types';
import { suggestPolicyAdjustmentsFromGovernance } from './policy-recommendation-from-governance.util';
import { detectGovernanceDriftFromLedger } from '../drift/detect-governance-drift-from-ledger.util';
import { computeGovernanceRecoveryQualityScore } from '../drift/compute-governance-recovery-quality.util';
import { suggestPolicyUpdateFromDrift } from '../drift/suggest-policy-update-from-drift.util';
import { deriveAdvisoryEscalationEventFromDrift } from '../drift/derive-advisory-escalation-from-drift.util';
import { buildGovernanceDriftInfluencesFromAssessment } from '../feedback/build-governance-drift-influence.util';
import { applyDriftInfluenceIfAllowed } from '../feedback/apply-drift-influence-if-allowed.util';

@Injectable()
export class GovernanceHydrationService {
  constructor(private readonly ledger: GovernanceLedgerStoreService) {}

  /**
   * Loads ledger tail, compacts snapshot, optional heuristic block lifecycle, pressure + activations + read-only policy hints.
   */
  async hydrateGovernanceSnapshot(
    tripId: string,
    opts?: HydrateGovernanceSnapshotOptions,
  ): Promise<HydratedGovernanceRuntimeContext> {
    const events = await this.ledger.replayGovernanceTimeline(tripId);
    let snapshot = compactGovernanceSnapshot(events, { tripId, maxSourceEvents: opts?.maxSourceEvents });
    const heuristicOn = opts?.heuristicResolveBlocks !== false;
    if (heuristicOn) {
      snapshot = {
        ...snapshot,
        unresolvedBlocks: applyHeuristicBlockResolutions(snapshot.unresolvedBlocks, events),
      };
    }
    const activations = deriveGovernanceActivationsFromGovernance({ events, snapshot });
    const pressure = buildGovernancePressureField(events);
    const suggestedPolicyAdjustments = suggestPolicyAdjustmentsFromGovernance(events);
    const signals = detectGovernanceDriftFromLedger(events, tripId, {
      runtimeState: snapshot.runtimeState,
      worldPressure: pressure.worldPressure,
    });
    const recoveryQuality = computeGovernanceRecoveryQualityScore(events, tripId);
    const driftPolicySuggestions = suggestPolicyUpdateFromDrift(signals);
    const advisoryEscalationEvent = deriveAdvisoryEscalationEventFromDrift(signals);
    const driftAssessment = {
      signals,
      recoveryQuality,
      driftPolicySuggestions,
      advisoryEscalationEvent,
    };
    const rawInfluences = buildGovernanceDriftInfluencesFromAssessment(driftAssessment);
    const driftInfluences = applyDriftInfluenceIfAllowed(rawInfluences, {
      enabled: opts?.allowDriftFeedbackInjection === true,
    });
    return {
      snapshot,
      activations,
      pressure,
      suggestedPolicyAdjustments,
      replayedEventCount: events.length,
      runtimeState: snapshot.runtimeState,
      driftAssessment,
      driftInfluences,
    };
  }
}
