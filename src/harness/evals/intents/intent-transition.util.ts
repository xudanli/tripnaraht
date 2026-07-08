import type { TravelContextDomain } from '../../../travel-context/domain/travel-context.constants';
import type {
  ContextHistoryEntry,
  TravelContextSnapshot,
  WorldFact,
} from '../../../travel-context/domain/travel-context.types';
import {
  buildTravelContextSnapshotId,
} from '../../../travel-context/domain/travel-context-revision';
import type { TravelContextHarnessAssertion } from '../../protocol/harness-case.types';
import { harnessAssert } from '../../protocol/run-travel-context-harness.util';
import type { ContextAuthorityTrace } from '../../protocol/execution-anchor.types';
import type {
  IntentTransitionInput,
  IntentTransitionResult,
} from './intent-transition.types';

const PROTECTED_WRITE_DOMAINS: TravelContextDomain[] = [
  'plan',
  'contract',
  'decisions',
];

function cloneSnapshot(
  snapshot: TravelContextSnapshot,
  revision: number,
  patch: (draft: TravelContextSnapshot) => void,
): TravelContextSnapshot {
  const next = structuredClone(snapshot);
  patch(next);
  next.meta = {
    ...next.meta,
    revision,
    previousRevision: snapshot.meta.revision,
    snapshotId: buildTravelContextSnapshotId(snapshot.identity.contextId, revision),
    generatedAt: new Date(revision).toISOString(),
  };
  return next;
}

function buildTrace(input: {
  before: TravelContextSnapshot;
  after: TravelContextSnapshot;
  authorityRunId: string;
  runtime: ContextAuthorityTrace['authority']['runtime'];
  gateway: string;
  changedDomains: TravelContextDomain[];
}): ContextAuthorityTrace {
  return {
    authorityRunId: input.authorityRunId,
    inputContext: {
      snapshotId: input.before.meta.snapshotId,
      revision: input.before.meta.revision,
    },
    authority: {
      runtime: input.runtime,
      gateway: input.gateway,
      policyVersion: 'harness-v1',
    },
    outputContext:
      input.after.meta.revision > input.before.meta.revision
        ? {
            snapshotId: input.after.meta.snapshotId,
            revision: input.after.meta.revision,
          }
        : undefined,
    changedDomains: input.changedDomains,
  };
}

function appendHistory(
  snapshot: TravelContextSnapshot,
  entry: Omit<ContextHistoryEntry, 'revision'>,
): void {
  snapshot.history.recent.unshift({
    ...entry,
    revision: snapshot.meta.revision,
  });
}

function reject(input: IntentTransitionInput, reasonCodes: string[]): IntentTransitionResult {
  return {
    outcome: 'REJECTED',
    reasonCodes,
    outputSnapshot: input.snapshot,
    changedDomains: [],
    events: ['INTENT_REJECTED'],
    trace: buildTrace({
      before: input.snapshot,
      after: input.snapshot,
      authorityRunId: input.authorityRunId,
      runtime: input.runtimeAuthority,
      gateway: input.gateway ?? 'IntentTransitionHarness',
      changedDomains: [],
    }),
  };
}

/**
 * Harness-level Intent Transition simulator (RFC-003 §9.5.3).
 * Phase H-P2 — until Travel Context `/intents` API lands.
 */
export function simulateIntentTransition(input: IntentTransitionInput): IntentTransitionResult {
  const basedOn = input.intent.basedOnRevision ?? input.snapshot.meta.revision;
  if (basedOn !== input.snapshot.meta.revision) {
    return reject(input, ['STALE_REVISION', 'CTX-CONCURRENCY-001']);
  }

  const nextRevision = input.snapshot.meta.revision + 1;
  const intentType = input.intent.type;

  if (intentType === 'APPLY_PLAN' && input.runtimeAuthority !== 'CANONICAL') {
    return reject(input, ['AUTHORITY_DENIED', 'CTX-AUTH-001']);
  }

  if (intentType === 'SELECT_ROUTE') {
    const routeId = String(input.intent.payload?.routeId ?? '');
    if (!routeId) {
      return reject(input, ['INVALID_INTENT_PAYLOAD']);
    }

    const changedDomains: TravelContextDomain[] = ['plan', 'history'];
    const outputSnapshot = cloneSnapshot(input.snapshot, nextRevision, (s) => {
      s.plan.selectedRouteId = routeId;
      appendHistory(s, {
        entryId: `hist_${input.authorityRunId}`,
        at: new Date(nextRevision).toISOString(),
        kind: 'INTENT_HANDLED',
        headline: `SELECT_ROUTE → ${routeId}`,
        actor: 'USER',
        refs: { intentType, routeId },
      });
    });

    return {
      outcome: 'APPLIED',
      reasonCodes: [],
      outputSnapshot,
      changedDomains,
      events: ['INTENT_ACCEPTED', 'PLAN_SELECTION_UPDATED'],
      trace: buildTrace({
        before: input.snapshot,
        after: outputSnapshot,
        authorityRunId: input.authorityRunId,
        runtime: input.runtimeAuthority,
        gateway: input.gateway ?? 'IntentTransitionHarness',
        changedDomains,
      }),
    };
  }

  if (intentType === 'UPDATE_INTENT') {
    const primaryGoal = input.intent.payload?.primaryGoal;
    if (typeof primaryGoal !== 'string' || !primaryGoal.trim()) {
      return reject(input, ['INVALID_INTENT_PAYLOAD']);
    }

    const changedDomains: TravelContextDomain[] = ['intent', 'history'];
    const outputSnapshot = cloneSnapshot(input.snapshot, nextRevision, (s) => {
      s.intent.primaryGoal = primaryGoal;
      appendHistory(s, {
        entryId: `hist_${input.authorityRunId}`,
        at: new Date(nextRevision).toISOString(),
        kind: 'INTENT_HANDLED',
        headline: 'UPDATE_INTENT',
        actor: 'USER',
      });
    });

    return {
      outcome: 'APPLIED',
      reasonCodes: [],
      outputSnapshot,
      changedDomains,
      events: ['INTENT_ACCEPTED', 'INTENT_CONTEXT_UPDATED'],
      trace: buildTrace({
        before: input.snapshot,
        after: outputSnapshot,
        authorityRunId: input.authorityRunId,
        runtime: input.runtimeAuthority,
        gateway: input.gateway ?? 'IntentTransitionHarness',
        changedDomains,
      }),
    };
  }

  return reject(input, ['UNSUPPORTED_INTENT_TYPE']);
}

export function assertIntentTransition001(
  before: TravelContextSnapshot,
  result: IntentTransitionResult,
): TravelContextHarnessAssertion[] {
  const revisionDelta = result.outputSnapshot.meta.revision - before.meta.revision;
  return [
    harnessAssert({
      name: 'intent_applied',
      pass: result.outcome === 'APPLIED',
      expected: 'APPLIED',
      actual: result.outcome,
    }),
    harnessAssert({
      name: 'revision_incremented',
      pass: revisionDelta === 1,
      expected: 1,
      actual: revisionDelta,
    }),
    harnessAssert({
      name: 'history_intent_handled',
      pass: result.outputSnapshot.history.recent.some((e) => e.kind === 'INTENT_HANDLED'),
      expected: true,
      actual: result.outputSnapshot.history.recent.map((e) => e.kind),
    }),
    harnessAssert({
      name: 'trace_declares_input_revision',
      pass: result.trace.inputContext.revision === before.meta.revision,
      expected: before.meta.revision,
      actual: result.trace.inputContext.revision,
    }),
  ];
}

export function assertIntentTransition002(
  before: TravelContextSnapshot,
  result: IntentTransitionResult,
): TravelContextHarnessAssertion[] {
  return [
    harnessAssert({
      name: 'intent_rejected_stale_revision',
      pass: result.outcome === 'REJECTED',
      expected: 'REJECTED',
      actual: result.outcome,
    }),
    harnessAssert({
      name: 'revision_unchanged',
      pass: result.outputSnapshot.meta.revision === before.meta.revision,
      expected: before.meta.revision,
      actual: result.outputSnapshot.meta.revision,
    }),
    harnessAssert({
      name: 'reason_code_stale_revision',
      pass: result.reasonCodes.includes('STALE_REVISION'),
      expected: 'STALE_REVISION',
      actual: result.reasonCodes,
    }),
    harnessAssert({
      name: 'no_output_context_on_reject',
      pass: result.trace.outputContext === undefined,
      expected: undefined,
      actual: result.trace.outputContext,
    }),
  ];
}

export function assertIntentTransition003(
  before: TravelContextSnapshot,
  result: IntentTransitionResult,
): TravelContextHarnessAssertion[] {
  const planUnchanged =
    before.plan.effectivePlan.versionId === result.outputSnapshot.plan.effectivePlan.versionId;
  return [
    harnessAssert({
      name: 'legacy_apply_plan_rejected',
      pass: result.outcome === 'REJECTED',
      expected: 'REJECTED',
      actual: result.outcome,
    }),
    harnessAssert({
      name: 'effective_plan_unchanged',
      pass: planUnchanged,
      expected: before.plan.effectivePlan.versionId,
      actual: result.outputSnapshot.plan.effectivePlan.versionId,
    }),
    harnessAssert({
      name: 'authority_denied_reason',
      pass: result.reasonCodes.includes('AUTHORITY_DENIED'),
      expected: 'AUTHORITY_DENIED',
      actual: result.reasonCodes,
    }),
  ];
}

export function domainsChanged(
  before: TravelContextSnapshot,
  after: TravelContextSnapshot,
): TravelContextDomain[] {
  const changed: TravelContextDomain[] = [];
  if (JSON.stringify(before.intent) !== JSON.stringify(after.intent)) changed.push('intent');
  if (JSON.stringify(before.plan) !== JSON.stringify(after.plan)) changed.push('plan');
  if (JSON.stringify(before.world) !== JSON.stringify(after.world)) changed.push('world');
  if (JSON.stringify(before.decisions) !== JSON.stringify(after.decisions)) changed.push('decisions');
  if (JSON.stringify(before.monitoring) !== JSON.stringify(after.monitoring)) {
    changed.push('monitoring');
  }
  if (JSON.stringify(before.contract) !== JSON.stringify(after.contract)) changed.push('contract');
  if (JSON.stringify(before.history) !== JSON.stringify(after.history)) changed.push('history');
  return changed;
}

export function assertForbiddenDomainsUnchanged(
  before: TravelContextSnapshot,
  after: TravelContextSnapshot,
  forbidden: TravelContextDomain[],
): TravelContextHarnessAssertion[] {
  const changed = domainsChanged(before, after);
  return forbidden.map((domain) =>
    harnessAssert({
      name: `forbidden_domain_${domain}_unchanged`,
      pass: !changed.includes(domain),
      expected: 'unchanged',
      actual: changed.includes(domain) ? 'changed' : 'unchanged',
    }),
  );
}

export function buildRoadClosedWorldFact(input: {
  roadId: string;
  observedAt: string;
  sourceId: string;
}): WorldFact {
  return {
    factId: `wf_road_${input.roadId.replace(/[^a-zA-Z0-9]/g, '_')}`,
    type: 'ROAD_CLOSED',
    kind: 'EXTERNAL_OBSERVED',
    value: { roadId: input.roadId, status: 'CLOSED' },
    observedAt: input.observedAt,
    sourceId: input.sourceId,
    authorityLevel: 'OFFICIAL',
    confidence: 1,
    replanTrigger: true,
  };
}

export { PROTECTED_WRITE_DOMAINS };
