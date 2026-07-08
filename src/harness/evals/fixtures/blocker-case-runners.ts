/**
 * Shared blocker case executors — used by blocker specs and deterministic replay gate.
 */

import { readConstraintSinkState } from '../../../agent/memory/constraint-sink/constraint-sink-state.util';
import {
  assertDecisionIdempotencyApiLayer,
  assertDecisionIdempotencySemanticsLayer,
} from '../assertions/decision-semantics.assertions';
import { assertMemoryDeleteFiveLayers } from '../assertions/memory-delete.assertions';
import { assertPrivateWishNotVisibleToPeer } from '../assertions/memory-pdi-isolation.assertions';
import {
  assertAssembledContextExcludes,
  assertAssembledContextIncludes,
  assertConstraintSinkPatchScope,
} from '../assertions/memory-scope.assertions';
import { assertStaleEvidenceBlocksAutoRepair } from '../assertions/policy-stale-evidence.assertions';
import {
  assertPartialApplyPathA,
  assertPartialApplyPathB,
} from '../assertions/state-partial-apply.assertions';
import type { BlockerCaseResult } from '../blockers/blocker-case.schema';
import { runBlockerCase } from '../runners/run-blocker-case.util';
import {
  buildRoadClosureCollected,
  createDecisionCenterHarness,
  TRIP_ID,
  USER_ID,
} from '../../../trips/decision-semantics/e2e/decision-center.harness';
import {
  assembleConstraintSinkContextText,
  buildElderlyCurfewTripTaskMemory,
  buildEmptyCoupleTripTaskMemory,
  COUPLE_TRIP_B,
  ELDERLY_CURFEW_NOTES_ZH,
  ELDERLY_CURFEW_TRIP_A,
} from './elderly-curfew-trip-scope.fixture';
import {
  createMemoryDeleteBlockerHarness,
  DELETE_BLOCKER_FORBIDDEN,
  DELETE_BLOCKER_PATCH_ID,
} from './memory-delete-blocker.harness';
import {
  assembleTripIntentContextText,
  loadTripIntentBundleForUser,
  PDI_FORBIDDEN_SNIPPETS,
  PDI_MEMBER_A,
  PDI_MEMBER_B,
  PDI_SECRET_TEXT,
} from './pdi-private-wish-isolation.fixture';

export async function runDsBlockerIdempotency001(
  variant = 0,
): Promise<BlockerCaseResult> {
  const harness = createDecisionCenterHarness(buildRoadClosureCollected());
  const { service, counters } = harness;

  const list = await service.listProblems(TRIP_ID);
  const problemId = list.items[0].id;
  const selectedOptionId = 'bypass_via_ring';
  const idempotencyKey = `idem-plan-b-bypass-ring-001-v${variant}`;

  const body = {
    problemId,
    selectedOptionId,
    idempotencyKey,
    reason: '接受绕行方案',
    acknowledgement: ['已知增加 45 分钟'],
  };

  const first = await service.createDecision(TRIP_ID, USER_ID, body);
  const second = await service.createDecision(TRIP_ID, USER_ID, body);

  return runBlockerCase({
    caseId: 'DS-BLOCKER-IDEMPOTENCY-001',
    run: async () => [
      ...assertDecisionIdempotencyApiLayer({ first, second }),
      ...assertDecisionIdempotencySemanticsLayer({
        records: harness.records,
        applyRepairCallCount: counters.applyRepairCalls,
        tripVersionResolveCallCount: counters.resolveTripVersionCalls,
      }),
    ],
  });
}

export async function runMemBlockerScope001(): Promise<BlockerCaseResult> {
  const tripA = buildElderlyCurfewTripTaskMemory(ELDERLY_CURFEW_TRIP_A);
  const tripB = buildEmptyCoupleTripTaskMemory(COUPLE_TRIP_B);

  const sinkA = readConstraintSinkState(tripA.constraints);
  const sinkB = readConstraintSinkState(tripB.constraints);

  const assembledA = assembleConstraintSinkContextText({
    tripTaskMemory: tripA,
    tripId: ELDERLY_CURFEW_TRIP_A,
  });
  const assembledB = assembleConstraintSinkContextText({
    tripTaskMemory: tripB,
    tripId: COUPLE_TRIP_B,
  });

  return runBlockerCase({
    caseId: 'MEM-BLOCKER-SCOPE-001',
    run: async () => [
      ...assertConstraintSinkPatchScope({
        tripId: ELDERLY_CURFEW_TRIP_A,
        ownerTripId: ELDERLY_CURFEW_TRIP_A,
        patchCount: sinkA?.patches?.length ?? 0,
        label: 'trip_a_has_sink_patch',
      }),
      ...assertConstraintSinkPatchScope({
        tripId: COUPLE_TRIP_B,
        ownerTripId: ELDERLY_CURFEW_TRIP_A,
        patchCount: sinkB?.patches?.length ?? 0,
        label: 'trip_b_has_no_foreign_patch',
      }),
      ...assertAssembledContextIncludes({
        assembledText: assembledA,
        requiredSnippets: [ELDERLY_CURFEW_NOTES_ZH, 'patch-elderly-curfew-trip-a'],
        label: 'trip_a_assembled_includes_curtew',
      }),
      ...assertAssembledContextExcludes({
        assembledText: assembledB,
        forbiddenSnippets: [ELDERLY_CURFEW_NOTES_ZH, '8点前', '老人'],
        label: 'trip_b_assembled_excludes_trip_a_curtew',
      }),
    ],
  });
}

export async function runMemBlockerDelete001(): Promise<BlockerCaseResult> {
  const harness = createMemoryDeleteBlockerHarness();
  await harness.seedWithPatch();
  await harness.persistSnapshotWithActiveTrip();

  await harness.console.deleteTripConstraintPatch(
    harness.userId,
    harness.tripId,
    DELETE_BLOCKER_PATCH_ID,
  );

  const probe = await harness.probeAfterDelete();

  return runBlockerCase({
    caseId: 'MEM-BLOCKER-DELETE-001',
    run: async () =>
      assertMemoryDeleteFiveLayers({
        probe,
        forbiddenSnippets: DELETE_BLOCKER_FORBIDDEN,
      }),
  });
}

export async function runStateBlockerPartial001PathB(): Promise<BlockerCaseResult> {
  const harness = createDecisionCenterHarness(buildRoadClosureCollected(), {
    postApplyValidateFails: true,
    rollbackOnValidateFail: false,
  });
  const { service, counters } = harness;

  const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
  const response = await service.createDecision(TRIP_ID, USER_ID, {
    problemId,
    selectedOptionId: 'bypass_via_ring',
    reason: '接受绕行方案',
    acknowledgement: ['已知增加 45 分钟'],
  });

  return runBlockerCase({
    caseId: 'STATE-BLOCKER-PARTIAL-001-path-b',
    run: async () =>
      assertPartialApplyPathB({
        response,
        applyRepairCalls: counters.applyRepairCalls,
        validateCalls: counters.validateCalls,
      }),
  });
}

export async function runStateBlockerPartial001PathA(): Promise<BlockerCaseResult> {
  const harness = createDecisionCenterHarness(buildRoadClosureCollected(), {
    postApplyValidateFails: true,
    rollbackOnValidateFail: true,
  });
  const { service } = harness;

  const list = await service.listProblems(TRIP_ID);
  const problemId = list.items[0].id;
  const preview = await service.previewOption(TRIP_ID, problemId, 'bypass_via_ring', USER_ID);
  const response = await service.createDecision(TRIP_ID, USER_ID, {
    problemId,
    selectedOptionId: 'bypass_via_ring',
    reason: '接受绕行方案',
    acknowledgement: ['已知增加 45 分钟'],
  });

  return runBlockerCase({
    caseId: 'STATE-BLOCKER-PARTIAL-001-path-a',
    run: async () =>
      assertPartialApplyPathA({
        response,
        records: harness.records,
        tripVersionBefore: preview.proposedMutations.versionBefore,
      }),
  });
}

export async function runPolicyBlockerStale001(): Promise<BlockerCaseResult> {
  const harness = createDecisionCenterHarness(buildRoadClosureCollected(), {
    staleRepairEvidence: true,
  });
  const { service, counters } = harness;

  const problemId = (await service.listProblems(TRIP_ID)).items[0].id;
  const response = await service.createDecision(TRIP_ID, USER_ID, {
    problemId,
    selectedOptionId: 'bypass_via_ring',
    reason: '尝试应用绕行',
    acknowledgement: ['已知增加 45 分钟'],
  });

  return runBlockerCase({
    caseId: 'POLICY-BLOCKER-STALE-001',
    run: async () =>
      assertStaleEvidenceBlocksAutoRepair({
        response,
        applyRepairCalls: counters.applyRepairCalls,
      }),
  });
}

export async function runMemBlockerPdi001(): Promise<BlockerCaseResult> {
  const ownerBundle = loadTripIntentBundleForUser(PDI_MEMBER_A);
  const peerBundle = loadTripIntentBundleForUser(PDI_MEMBER_B);

  if (
    !ownerBundle.privateWishDigest?.items.some((i) => i.text.includes(PDI_SECRET_TEXT)) ||
    peerBundle.privateWishDigest !== null ||
    (peerBundle.wishConstraintDigest?.mustAvoid ?? []).includes('恐高')
  ) {
    throw new Error('MEM-BLOCKER-PDI-001 fixture precondition failed');
  }

  const ownerContext = assembleTripIntentContextText(PDI_MEMBER_A);
  const peerContext = assembleTripIntentContextText(PDI_MEMBER_B);

  return runBlockerCase({
    caseId: 'MEM-BLOCKER-PDI-001',
    run: async () =>
      assertPrivateWishNotVisibleToPeer({
        ownerContextText: ownerContext,
        peerContextText: peerContext,
        forbiddenSnippets: PDI_FORBIDDEN_SNIPPETS,
        peerUserId: PDI_MEMBER_B,
      }),
  });
}

/** P0 cases eligible for deterministic ReplayPass@N */
export const REPLAY_P0_RUNNERS: Array<{
  caseId: string;
  run: () => Promise<BlockerCaseResult>;
}> = [
  { caseId: 'DS-BLOCKER-IDEMPOTENCY-001', run: () => runDsBlockerIdempotency001(0) },
  { caseId: 'MEM-BLOCKER-SCOPE-001', run: runMemBlockerScope001 },
  { caseId: 'MEM-BLOCKER-DELETE-001', run: runMemBlockerDelete001 },
];

/** P1 policy/state cases for PolicyPass@N with variant index */
export const POLICY_PASS_RUNNERS: Array<{
  caseId: string;
  run: () => Promise<BlockerCaseResult>;
}> = [
  { caseId: 'POLICY-BLOCKER-STALE-001', run: runPolicyBlockerStale001 },
  { caseId: 'STATE-BLOCKER-PARTIAL-001-path-a', run: runStateBlockerPartial001PathA },
  { caseId: 'STATE-BLOCKER-PARTIAL-001-path-b', run: runStateBlockerPartial001PathB },
  { caseId: 'MEM-BLOCKER-PDI-001', run: runMemBlockerPdi001 },
];
