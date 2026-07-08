import type { TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import {
  buildTravelContextSnapshotId,
  buildWorldStateVersionLabel,
} from '../../../travel-context/domain/travel-context-revision';
import type { RoadSegmentUnavailableRunResult } from '../../../trips/guardian-decision-core/execution/road-segment-unavailable-runner.service';
import type { StoredRfc001WorldState } from '../../../trips/guardian-decision-core/evidence/world-state-store.service';
import { RFC001_REASON_CODES } from '../../../trips/guardian-decision-core/reason-codes/reason-code.registry';
import type { ContextAuthorityTrace } from '../../protocol/execution-anchor.types';
import type { TravelContextDomain } from '../../../travel-context/domain/travel-context.constants';
import { buildRoadClosedWorldFact, domainsChanged } from '../intents/intent-transition.util';
import type { ReplanningTransitionResult } from './replanning.util';

export interface Rfc001RoadCloseContextBridgeInput {
  before: TravelContextSnapshot;
  run: RoadSegmentUnavailableRunResult;
  world: StoredRfc001WorldState;
  roadId: string;
  observedAt: string;
  authorityRunId: string;
}

export interface Rfc001RoadCloseContextBridgeResult {
  after: TravelContextSnapshot;
  replan: ReplanningTransitionResult;
}

function mapRfc001Urgency(
  urgency: string,
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  if (urgency === 'LOW' || urgency === 'MEDIUM' || urgency === 'HIGH' || urgency === 'CRITICAL') {
    return urgency;
  }
  return 'HIGH';
}

/** Project live RFC001 road-close run → Travel Context after snapshot (H-P3). */
export function projectRfc001RoadCloseToTravelContext(
  input: Rfc001RoadCloseContextBridgeInput,
): TravelContextSnapshot {
  const { before, run, world, roadId, observedAt, authorityRunId } = input;
  if (!run.problem || !run.record) {
    return before;
  }

  const nextRevision = before.meta.revision + 1;
  const fact = buildRoadClosedWorldFact({ roadId, observedAt, sourceId: 'rfc001_world_store' });
  const roadAssertion = world.assertions.find((a) => a.predicate === 'road.status');
  if (roadAssertion) {
    fact.sourceId = roadAssertion.source.provider ?? fact.sourceId;
    fact.observedAt = roadAssertion.observedAt ?? observedAt;
  }

  const waitingUser =
    run.record.finalAction === 'DEFER_TO_HUMAN' ||
    run.record.reasonCodes.includes(RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED);

  const after: TravelContextSnapshot = structuredClone(before);
  after.meta = {
    ...after.meta,
    revision: nextRevision,
    previousRevision: before.meta.revision,
    snapshotId: buildTravelContextSnapshotId(before.identity.contextId, nextRevision),
    generatedAt: new Date(nextRevision).toISOString(),
    bindings: {
      ...after.meta.bindings,
      worldStateVersion: buildWorldStateVersionLabel(
        run.problem.worldStateSnapshotId ?? world.snapshots[0]?.snapshotId,
      ),
    },
  };

  after.world = {
    ...after.world,
    facts: [...after.world.facts.filter((f) => f.factId !== fact.factId), fact],
    lastRefreshedAt: observedAt,
  };

  const openDecision = {
    decisionId: run.record.decisionId,
    problemType: 'ROAD_SEGMENT_UNAVAILABLE',
    title: `Road ${roadId} closed — plan impact`,
    urgency: mapRfc001Urgency(run.problem.urgency),
    status: waitingUser ? ('WAITING_USER' as const) : ('DETECTED' as const),
    authorizationRequired: waitingUser,
    affectedScope: { planItemIds: run.problem.affectedPlanItemIds },
  };

  const open = [
    ...after.decisions.open.filter((d) => d.decisionId !== openDecision.decisionId),
    openDecision,
  ];
  after.decisions = {
    open,
    counts: {
      total: open.length,
      blocking: open.filter((d) => d.authorizationRequired).length,
      actionable: open.length,
    },
  };

  after.monitoring = {
    ...after.monitoring,
    activeCount: after.monitoring.activeCount + 1,
    items: [
      ...after.monitoring.items,
      {
        itemId: `mon_rfc001_${roadId}`,
        kind: 'road_status',
        status: 'ACTIVE' as const,
        headline: `${roadId} closed — RFC001 canonical`,
        lastCheckedAt: observedAt,
        authorizationTier: waitingUser ? 'ASK_BEFORE_APPLY' : 'AUTO_APPLY',
      },
    ],
  };

  after.history.recent.unshift({
    entryId: `hist_${authorityRunId}`,
    at: observedAt,
    revision: nextRevision,
    kind: 'WORLD_FACT_CHANGED',
    headline: `RFC001 ROAD_CLOSED ${roadId}`,
    actor: 'MONITORING',
    refs: {
      decisionId: run.record.decisionId,
      problemId: run.problem.problemId,
      factId: fact.factId,
    },
  });

  return after;
}

export function buildRfc001RoadCloseBridgeResult(
  input: Rfc001RoadCloseContextBridgeInput,
): Rfc001RoadCloseContextBridgeResult {
  const after = projectRfc001RoadCloseToTravelContext(input);
  const changedDomains = domainsChanged(input.before, after);
  const waitingUser =
    input.run.record?.finalAction === 'DEFER_TO_HUMAN' ||
    Boolean(input.run.record?.reasonCodes.includes(RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED));

  const reasonCodes = ['ROAD_CLOSED', 'ACTIVE_PLAN_AFFECTED'];
  if (waitingUser) reasonCodes.push('USER_CONFIRMATION_REQUIRED');

  const trace: ContextAuthorityTrace = {
    authorityRunId: input.authorityRunId,
    inputContext: {
      snapshotId: input.before.meta.snapshotId,
      revision: input.before.meta.revision,
    },
    authority: {
      runtime: 'CANONICAL',
      gateway: 'Rfc001RoadSegmentUnavailableRunner',
      policyVersion: 'rfc001-v1',
    },
    outputContext: {
      snapshotId: after.meta.snapshotId,
      revision: after.meta.revision,
    },
    changedDomains: changedDomains as string[],
  };

  const replan: ReplanningTransitionResult = {
    outcome: waitingUser ? 'WAITING_USER' : 'APPLIED',
    reasonCodes,
    outputSnapshot: after,
    changedDomains: changedDomains as TravelContextDomain[],
    events: ['WORLD_FACT_OBSERVED', 'PLAN_IMPACT_DETECTED', 'DECISION_PROBLEM_CREATED'],
    trace,
  };

  return { after, replan };
}
