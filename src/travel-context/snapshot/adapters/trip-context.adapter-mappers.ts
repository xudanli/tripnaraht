import type { TripContextSnapshotView } from '../../../decision-runtime/snapshot/contracts/trip-context-snapshot.types';
import type {
  TravelIntentContext,
  ParticipantContext,
  TravelContractContext,
  WorldFact,
} from '../../domain/travel-context.types';
import { buildTripContextWorldFacts, collectTripOntologyFacts } from '../../../travel-ontology/adapters/trip-world-facts.builder';
import { evaluateOntologyConstraints } from '../../../travel-ontology/evaluators/ontology-constraint.evaluator';

export function mapTripIntent(t: TripContextSnapshotView): TravelIntentContext {
  return {
    primaryGoal: t.goal.rawUserIntent,
    destination: {
      status: 'CONFIRMED',
      countryCode: t.goal.destination.slice(0, 2).toUpperCase(),
      label: t.goal.destination,
    },
    dateRange: {
      startDate: t.goal.startDate,
      endDate: t.goal.endDate,
    },
    rankedPrinciples: t.goal.rankedPrinciples,
    budget: t.budget
      ? {
          currency: t.budget.currency ?? 'USD',
          max: t.budget.total,
          style: t.budget.style,
        }
      : undefined,
  };
}

export function mapTripContractAndParticipants(t: TripContextSnapshotView): {
  participants: ParticipantContext;
  contract: TravelContractContext;
} {
  return {
    participants: {
      count: t.members.count,
      publicSummary: Array.isArray(t.members.travelers)
        ? (t.members.travelers as Array<Record<string, unknown>>).map((tr, i) => ({
            memberId: String(tr.id ?? `traveler_${i}`),
            role: String(tr.role ?? 'TRAVELER'),
            mobilityBand: tr.mobilityBand ? String(tr.mobilityBand) : undefined,
          }))
        : [],
      preferenceCoverage: {
        mobility: t.members.count > 0 ? 'PARTIAL' : 'MISSING',
        privateWishes: 'MISSING',
      },
    },
    contract: {
      constraints: [],
      changeStrategy: t.contract.changeStrategy,
      automation: { defaultLevel: t.contract.automation.defaultLevel },
      teamGovernance: t.contract.teamGovernance as unknown as Record<string, unknown>,
      conflictSummary: {
        count:
          (t.contract.conflicts.mustHandle ?? 0) +
          (t.contract.conflicts.suggestAdjust ?? 0) +
          (t.contract.conflicts.pendingConfirm ?? 0),
        blockingCount: t.contract.conflicts.mustHandle ?? 0,
      },
    },
  };
}

export function mapWorldFactsFromTripSnapshot(t: TripContextSnapshotView): WorldFact[] {
  return buildTripContextWorldFacts(t);
}

/** 基于 Ontology 约束评估解析计划可执行性（BFF 只读，不绕过 Gateway） */
export function resolveTripExecutabilityStatus(
  t: TripContextSnapshotView,
): 'EXECUTABLE' | 'BLOCKED' | 'UNKNOWN' {
  if (t.ontologyConstraints?.blockerCount && t.ontologyConstraints.blockerCount > 0) {
    return 'BLOCKED';
  }

  const ontologyFacts = collectTripOntologyFacts(t);
  if (ontologyFacts.length > 0) {
    const { results } = evaluateOntologyConstraints(ontologyFacts);
    if (results.some((r) => r.severity === 'BLOCK')) {
      return 'BLOCKED';
    }
  }

  return t.effectivePlan.hasEffectivePlan ? 'EXECUTABLE' : 'UNKNOWN';
}
