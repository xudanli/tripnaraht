import type { TravelContextDomain } from '../../../travel-context/domain/travel-context.constants';
import type { OpenDecision, TravelContextSnapshot } from '../../../travel-context/domain/travel-context.types';
import {
  buildTravelContextSnapshotId,
  buildWorldStateVersionLabel,
} from '../../../travel-context/domain/travel-context-revision';
import type { TravelContextHarnessAssertion } from '../../protocol/harness-case.types';
import { harnessAssert } from '../../protocol/run-travel-context-harness.util';
import type { ContextAuthorityTrace } from '../../protocol/execution-anchor.types';
import type { TravelWorldEvent } from '../../protocol/harness-case.types';
import {
  assertForbiddenDomainsUnchanged,
  buildRoadClosedWorldFact,
  domainsChanged,
} from '../intents/intent-transition.util';

export interface RoadClosureReplanInput {
  snapshot: TravelContextSnapshot;
  event: TravelWorldEvent & { roadId: string; observedAt: string; sourceId: string };
  authorizationPolicy?: { roadClosure?: 'ASK_BEFORE_APPLY' | 'AUTO_APPLY' };
  authorityRunId: string;
}

export interface ReplanningTransitionResult {
  outcome: 'WAITING_USER' | 'APPLIED' | 'NO_CHANGE';
  reasonCodes: string[];
  outputSnapshot: TravelContextSnapshot;
  changedDomains: TravelContextDomain[];
  events: string[];
  trace: ContextAuthorityTrace;
}

/**
 * Monitoring → World Fact → Impact → Open Decision (RFC-003 §9.5.6 / §9.7).
 * Does not silently mutate effectivePlan when authorization requires confirmation.
 */
export function simulateRoadClosureReplanning(
  input: RoadClosureReplanInput,
): ReplanningTransitionResult {
  const { snapshot, event } = input;
  const policy = input.authorizationPolicy?.roadClosure ?? 'ASK_BEFORE_APPLY';
  const nextRevision = snapshot.meta.revision + 1;
  const fact = buildRoadClosedWorldFact({
    roadId: event.roadId,
    observedAt: event.observedAt,
    sourceId: event.sourceId,
  });

  const newDecision: OpenDecision = {
    decisionId: `prob_road_${event.roadId}_${nextRevision}`,
    problemType: 'ROAD_SEGMENT_UNAVAILABLE',
    title: `${event.roadId} 道路关闭影响行程`,
    urgency: 'HIGH',
    status: 'WAITING_USER',
    authorizationRequired: policy === 'ASK_BEFORE_APPLY',
    affectedScope: { planItemIds: [`drive_${event.roadId}`] },
  };

  const outputSnapshot: TravelContextSnapshot = structuredClone(snapshot);
  outputSnapshot.meta = {
    ...outputSnapshot.meta,
    revision: nextRevision,
    previousRevision: snapshot.meta.revision,
    snapshotId: buildTravelContextSnapshotId(snapshot.identity.contextId, nextRevision),
    generatedAt: new Date(nextRevision).toISOString(),
    bindings: {
      ...outputSnapshot.meta.bindings,
      worldStateVersion: buildWorldStateVersionLabel(`ws_${event.roadId}_${nextRevision}`),
    },
  };
  outputSnapshot.world = {
    ...outputSnapshot.world,
    facts: [...outputSnapshot.world.facts, fact],
    lastRefreshedAt: event.observedAt,
  };
  outputSnapshot.decisions = {
    open: [...outputSnapshot.decisions.open, newDecision],
    counts: {
      total: outputSnapshot.decisions.counts.total + 1,
      blocking: outputSnapshot.decisions.counts.blocking + 1,
      actionable: outputSnapshot.decisions.counts.actionable + 1,
    },
  };
  outputSnapshot.monitoring = {
    ...outputSnapshot.monitoring,
    activeCount: outputSnapshot.monitoring.activeCount + 1,
    items: [
      ...outputSnapshot.monitoring.items,
      {
        itemId: `mon_road_${event.roadId}`,
        kind: 'road_status',
        status: 'ACTIVE',
        headline: `${event.roadId} 已关闭 — 待用户确认`,
        lastCheckedAt: event.observedAt,
        authorizationTier: policy,
      },
    ],
  };
  outputSnapshot.history.recent.unshift({
    entryId: `hist_${input.authorityRunId}`,
    at: event.observedAt,
    revision: nextRevision,
    kind: 'WORLD_FACT_CHANGED',
    headline: `ROAD_CLOSED ${event.roadId}`,
    actor: 'MONITORING',
    refs: { roadId: event.roadId, factId: fact.factId },
  });

  const changedDomains = domainsChanged(snapshot, outputSnapshot);
  const reasonCodes = ['ROAD_CLOSED', 'ACTIVE_PLAN_AFFECTED'];
  if (policy === 'ASK_BEFORE_APPLY') {
    reasonCodes.push('USER_CONFIRMATION_REQUIRED');
  }

  const events = ['WORLD_FACT_OBSERVED', 'PLAN_IMPACT_DETECTED', 'DECISION_PROBLEM_CREATED'];

  return {
    outcome: policy === 'ASK_BEFORE_APPLY' ? 'WAITING_USER' : 'APPLIED',
    reasonCodes,
    outputSnapshot,
    changedDomains,
    events,
    trace: {
      authorityRunId: input.authorityRunId,
      inputContext: {
        snapshotId: snapshot.meta.snapshotId,
        revision: snapshot.meta.revision,
      },
      authority: {
        runtime: 'CANONICAL',
        gateway: 'MonitoringReplanHarness',
        policyVersion: 'harness-v1',
      },
      outputContext: {
        snapshotId: outputSnapshot.meta.snapshotId,
        revision: outputSnapshot.meta.revision,
      },
      changedDomains,
    },
  };
}

/** REPLAN-ROAD-CLOSURE-001 assertions (RFC-003 §9.7) */
export function assertReplanRoadClosure001(
  before: TravelContextSnapshot,
  result: ReplanningTransitionResult,
): TravelContextHarnessAssertion[] {
  const assertions: TravelContextHarnessAssertion[] = [
    harnessAssert({
      name: 'outcome_waiting_user',
      pass: result.outcome === 'WAITING_USER',
      expected: 'WAITING_USER',
      actual: result.outcome,
    }),
    harnessAssert({
      name: 'revision_delta_one',
      pass: result.outputSnapshot.meta.revision - before.meta.revision === 1,
      expected: 1,
      actual: result.outputSnapshot.meta.revision - before.meta.revision,
    }),
    harnessAssert({
      name: 'world_fact_added',
      pass: result.outputSnapshot.world.facts.some((f) => f.type === 'ROAD_CLOSED'),
      expected: true,
      actual: result.outputSnapshot.world.facts.map((f) => f.type),
    }),
    harnessAssert({
      name: 'open_decision_created',
      pass: result.outputSnapshot.decisions.open.some(
        (d) => d.problemType === 'ROAD_SEGMENT_UNAVAILABLE',
      ),
      expected: true,
      actual: result.outputSnapshot.decisions.open.map((d) => d.problemType),
    }),
    harnessAssert({
      name: 'monitoring_updated',
      pass: result.outputSnapshot.monitoring.activeCount > before.monitoring.activeCount,
      expected: 'increased',
      actual: result.outputSnapshot.monitoring.activeCount,
    }),
    harnessAssert({
      name: 'effective_plan_version_unchanged',
      pass:
        before.plan.effectivePlan.versionId ===
        result.outputSnapshot.plan.effectivePlan.versionId,
      expected: before.plan.effectivePlan.versionId,
      actual: result.outputSnapshot.plan.effectivePlan.versionId,
    }),
    harnessAssert({
      name: 'expected_events_emitted',
      pass: ['WORLD_FACT_OBSERVED', 'PLAN_IMPACT_DETECTED', 'DECISION_PROBLEM_CREATED'].every(
        (e) => result.events.includes(e),
      ),
      expected: ['WORLD_FACT_OBSERVED', 'PLAN_IMPACT_DETECTED', 'DECISION_PROBLEM_CREATED'],
      actual: result.events,
    }),
    harnessAssert({
      name: 'reason_codes_include_road_closed',
      pass: result.reasonCodes.includes('ROAD_CLOSED'),
      expected: 'ROAD_CLOSED',
      actual: result.reasonCodes,
    }),
  ];

  assertions.push(
    ...assertForbiddenDomainsUnchanged(before, result.outputSnapshot, [
      'plan',
      'contract',
      'participants',
    ]),
  );

  return assertions;
}
