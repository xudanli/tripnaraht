/**
 * Loads Trip Snapshot world.facts and evaluates Ontology constraints via Constraint Gateway.
 */

import { Injectable, Optional } from '@nestjs/common';
import type { TripPlan } from '../../../trips/decision/plan-model';
import type { TripWorldState } from '../../../trips/decision/world-model';
import type { WorldFact } from '../../../travel-context/domain/travel-context.types';
import { buildTripContextWorldFacts } from '../../../travel-ontology/adapters/trip-world-facts.builder';
import { TripContextSnapshotAssemblerService } from '../../snapshot/trip-context-snapshot.assembler.service';
import type { CanonicalConstraintReport } from '../contracts/canonical-constraint-report';
import type { EvaluatePlanInput } from '../contracts/evaluate-input.types';
import { ConstraintEvaluationGatewayService } from '../constraint-evaluation.gateway.service';

function emptyOntologyPlan(tripId: string): TripPlan {
  return {
    version: 'ontology-bridge@v1',
    createdAt: new Date().toISOString(),
    tripId,
    days: [{ day: 1, date: '2026-07-01', timeSlots: [] }],
  };
}

function emptyOntologyWorldState(tripId: string): TripWorldState {
  return {
    context: {
      tripId,
      destination: 'IS',
      startDate: '2026-07-01',
      durationDays: 1,
      travelModeDefault: 'unknown',
      preferences: { intents: {}, pace: 'moderate', riskTolerance: 'medium' },
    },
    candidatesByDate: {},
    signals: { lastUpdatedAt: new Date().toISOString() },
  };
}

@Injectable()
export class TripOntologyGatewayBridgeService {
  constructor(
    private readonly gateway: ConstraintEvaluationGatewayService,
    @Optional()
    private readonly snapshotAssembler?: TripContextSnapshotAssemblerService,
  ) {}

  async loadSnapshotWorldFacts(tripId: string): Promise<WorldFact[]> {
    if (!this.snapshotAssembler) return [];
    const view = await this.snapshotAssembler.assemble(tripId);
    return buildTripContextWorldFacts(view);
  }

  /** Gateway evaluatePlan with Snapshot SSOT world.facts auto-loaded when omitted */
  async evaluatePlanWithOntologyFacts(
    input: EvaluatePlanInput,
  ): Promise<CanonicalConstraintReport> {
    const snapshotWorldFacts =
      input.snapshotWorldFacts ?? (await this.loadSnapshotWorldFacts(input.tripId));

    return this.gateway.evaluatePlan({
      tripId: input.tripId,
      plan: input.plan ?? emptyOntologyPlan(input.tripId),
      worldState: input.worldState ?? emptyOntologyWorldState(input.tripId),
      candidateId: input.candidateId,
      countryCode: input.countryCode,
      userId: input.userId,
      dataAvailability: input.dataAvailability,
      guardianAssertions: input.guardianAssertions,
      packContext: input.packContext,
      evaluationMode: input.evaluationMode ?? 'PLAN_VERIFY',
      skipLegacyChecker: input.skipLegacyChecker ?? true,
      travelWorldFacts: input.travelWorldFacts,
      snapshotWorldFacts: snapshotWorldFacts.length > 0 ? snapshotWorldFacts : undefined,
    });
  }

  async countOntologyGatewayAssertions(tripId: string): Promise<number> {
    const report = await this.evaluatePlanWithOntologyFacts({
      tripId,
      plan: emptyOntologyPlan(tripId),
      worldState: emptyOntologyWorldState(tripId),
    });
    return report.assertions.filter((a) => a.constraintType === 'TRAVEL_ONTOLOGY').length;
  }
}
