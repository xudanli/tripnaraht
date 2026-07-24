/**
 * RFC §18.4 — Iceland road-close vertical slice acceptance harness (10 assertions).
 */

import { buildRoadStatusChangedEvent } from '../evidence/road-status-changed.event';
import { buildItemSegmentId } from '../detection/road-close-impact-analyzer';
import { ORIGINAL_CANDIDATE_ID } from '../adapters/repair-candidate.adapter';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { RFC001_REASON_CODES } from '../reason-codes/reason-code.registry';
import {
  buildIcelandRoadCloseHarnessStack,
  createHarnessMockPrisma,
  harnessTripRow,
  HARNESS_ITEM_DRIVE,
  HARNESS_TRIP_ID,
} from './iceland-road-close.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('Iceland road-close harness (RFC §18.4)', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
  });

  it('runs ICE-WS-001 … ICE-LIN-001 end-to-end', async () => {
    const mock = createHarnessMockPrisma({ [HARNESS_TRIP_ID]: harnessTripRow() });
    const prisma = mock as unknown as PrismaService;
    const stack = buildIcelandRoadCloseHarnessStack(prisma);

    const segmentId = buildItemSegmentId(HARNESS_TRIP_ID, HARNESS_ITEM_DRIVE);
    const event = buildRoadStatusChangedEvent({
      tripId: HARNESS_TRIP_ID,
      roadId: 'F208',
      status: 'CLOSED',
      segmentId,
      sourceProvider: 'admin_injection',
      occurredAt: new Date().toISOString(),
    });

    const run = await stack.runner.runFullFromEvent(event);
    expect(run.problem).not.toBeNull();
    expect(run.workspace).not.toBeNull();
    expect(run.record).not.toBeNull();

    const world = await stack.worldStore.readStore(HARNESS_TRIP_ID);
    const assertion = world.assertions.find((a) => a.predicate === 'road.status');

    // ICE-WS-001
    expect(assertion?.source.evidenceRefs.length).toBeGreaterThan(0);
    expect(assertion?.validUntil).toBeDefined();
    expect(world.snapshots[0]?.snapshotId).toBeDefined();

    // ICE-IMPACT-001
    expect(run.problem!.affectedPlanItemIds).toContain(HARNESS_ITEM_DRIVE);

    // ICE-BLOCK-001
    const originalBlock = run.workspace!.constraintAssertions.find(
      (a) => a.targetCandidateId === ORIGINAL_CANDIDATE_ID && a.verdict === 'BLOCK',
    );
    expect(originalBlock?.overridable).toBe(false);
    await expect(
      stack.authorization.authorize({
        tripId: HARNESS_TRIP_ID,
        decisionId: run.record!.decisionId,
        choice: ORIGINAL_CANDIDATE_ID,
      }),
    ).rejects.toThrow(/BLOCK/);

    // ICE-NEP-001
    const methods = new Set(
      run.workspace!.repairCandidates.map((c) => c.generationMethod),
    );
    expect(run.workspace!.repairCandidates.length).toBeGreaterThanOrEqual(2);
    expect(methods.size).toBeGreaterThanOrEqual(2);

    // ICE-REVAL-001
    expect(run.workspace!.loadAssessments.length).toBeGreaterThanOrEqual(4);
    const candidateIds = new Set(
      run.workspace!.loadAssessments.map((a) => a.targetCandidateId),
    );
    expect(candidateIds.has('cand_a')).toBe(true);
    expect(candidateIds.has('cand_b')).toBe(true);

    // ICE-CORE-001
    expect(Array.isArray(run.record!.reasonCodes)).toBe(true);
    if (run.record!.finalAction === 'DEFER_TO_HUMAN') {
      expect(run.record!.reasonCodes).toContain(
        RFC001_REASON_CODES.HUMAN_CONFIRMATION_REQUIRED,
      );
    }

    // ICE-L2-001
    const effectiveBefore = await stack.planVersionStore.getEffectivePlanVersionId(
      HARNESS_TRIP_ID,
    );
    expect(effectiveBefore).toBeUndefined();

    const { record: authorized } = await stack.authorization.authorize({
      tripId: HARNESS_TRIP_ID,
      decisionId: run.record!.decisionId,
      choice: 'cand_a',
    });
    expect(authorized.recordStatus).toBe('AUTHORIZED');
    expect(
      await stack.planVersionStore.getEffectivePlanVersionId(HARNESS_TRIP_ID),
    ).toBeUndefined();

    // ICE-IDEM-001
    const key = buildPlanVersionIdempotencyKey(HARNESS_TRIP_ID, run.record!.decisionId);
    const first = await stack.executor.execute({
      tripId: HARNESS_TRIP_ID,
      decisionId: run.record!.decisionId,
      idempotencyKey: key,
    });
    const second = await stack.executor.execute({
      tripId: HARNESS_TRIP_ID,
      decisionId: run.record!.decisionId,
      idempotencyKey: key,
    });
    expect(second.idempotentReplay).toBe(true);
    expect(second.planVersion.planVersionId).toBe(first.planVersion.planVersionId);
    const block = await stack.planVersionStore.readBlock(HARNESS_TRIP_ID);
    expect(block.items.filter((v) => v.status === 'EFFECTIVE')).toHaveLength(1);

    // ICE-RB-001
    const parentId = run.planVersion!.parentPlanVersionId!;
    const rolled = await stack.executor.rollback({
      tripId: HARNESS_TRIP_ID,
      decisionId: run.record!.decisionId,
    });
    expect(rolled.effectivePlanVersionId).toBe(parentId);
    expect(rolled.record.recordStatus).toBe('ROLLED_BACK');

    // ICE-LIN-001
    const centerView = await stack.readModel.getProblemView(
      HARNESS_TRIP_ID,
      run.problem!.problemId,
    );
    const kinds = centerView.lineage.map((l) => l.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'EVENT',
        'ASSERTION',
        'SNAPSHOT',
        'PROBLEM',
        'WORKSPACE',
        'DECISION',
        'PLAN_VERSION',
      ]),
    );
    expect(centerView.leadingPersona).toBe('ABU');
    expect(centerView.problemSummary.affectedScopeDisplay?.length).toBeGreaterThan(0);
    expect(centerView.options.length).toBeGreaterThanOrEqual(2);
  });
});
