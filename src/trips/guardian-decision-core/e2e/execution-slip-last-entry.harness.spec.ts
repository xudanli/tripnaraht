/**
 * Slice 3 E9 — execution slip last-entry harness (10 cases).
 */

import { BadRequestException } from '@nestjs/common';
import { assertExecutionAdvisoryDirectApplyAllowed } from '../../trip-constraint-solver/utils/execution-advisory-write-chain.util';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { EXECUTION_SLIP_CANDIDATE_IDS } from '../contracts/execution-slip.types';
import { evaluateExecutionSlipRevalidation } from '../revalidation/execution-slip-revalidation.util';
import { evaluateShortenCandidateFeasible } from '../adapters/execution-slip-repair-candidate.adapter';
import { ExecutionDepartureSlipService } from '../services/execution-departure-slip.service';
import {
  buildExecutionSlipHarnessStack,
  buildHarnessObservation,
  createExecutionSlipHarnessMockPrisma,
  harnessExecutionSlipTripRow,
  HARNESS_ACTIVITY_A,
  HARNESS_EXEC_TRIP_ID,
  HARNESS_OBSERVED_LATE,
  HARNESS_OBSERVED_SLIGHT,
  HARNESS_PLANNED_DEPART,
  HARNESS_REMAINING_STAY,
  HARNESS_TRAVEL_MINUTES,
} from './execution-slip-last-entry.harness.util';
import type { PrismaService } from '../../../prisma/prisma.service';

describe('execution-slip-last-entry harness', () => {
  const prevShadow = process.env.RFC001_SHADOW_MODE;
  const prevFlag = process.env.CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE;
  const prevWriteChain = process.env.EFFECTIVE_PLAN_WRITE_CHAIN;

  beforeEach(() => {
    process.env.RFC001_SHADOW_MODE = '0';
    process.env.CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE = '1';
  });

  afterEach(() => {
    if (prevShadow === undefined) delete process.env.RFC001_SHADOW_MODE;
    else process.env.RFC001_SHADOW_MODE = prevShadow;
    if (prevFlag === undefined) delete process.env.CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE;
    else process.env.CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE = prevFlag;
    if (prevWriteChain === undefined) delete process.env.EFFECTIVE_PLAN_WRITE_CHAIN;
    else process.env.EFFECTIVE_PLAN_WRITE_CHAIN = prevWriteChain;
  });

  function stack() {
    const mock = createExecutionSlipHarnessMockPrisma({
      [HARNESS_EXEC_TRIP_ID]: harnessExecutionSlipTripRow(),
    });
    return {
      mock,
      stack: buildExecutionSlipHarnessStack(mock as unknown as PrismaService),
    };
  }

  it('Case 1: 10 min delay still feasible → NO_ACTION', async () => {
    const { stack: s } = stack();
    const run = await s.runner.runFullFromObservation(
      buildHarnessObservation({
        observedAt: HARNESS_OBSERVED_SLIGHT,
      }),
      { remainingStayMinutes: 30, travelDurationMinutes: HARNESS_TRAVEL_MINUTES },
    );
    expect(run.noAction).toBe(true);
    expect(run.problem).toBeNull();
  });

  it('Case 2: 35 min delay misses lastEntryAt → Problem OPEN', async () => {
    const { stack: s } = stack();
    const run = await s.runner.runFullFromObservation(buildHarnessObservation(), {
      remainingStayMinutes: HARNESS_REMAINING_STAY,
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
    });
    expect(run.problem).not.toBeNull();
    expect(['OPEN', 'WAITING_HUMAN', 'DECIDED']).toContain(run.problem!.status);
    expect(run.problem!.semanticCapability).toBe('EXECUTION_SCHEDULE_INFEASIBLE');
    expect(run.workspace!.repairCandidates.length).toBeGreaterThanOrEqual(2);
  });

  it('Case 3: shorten still too late → candidate rejected', () => {
    const ok = evaluateShortenCandidateFeasible({
      observationAt: HARNESS_OBSERVED_LATE,
      remainingStayMinutes: HARNESS_REMAINING_STAY,
      shortenMinutes: 5,
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
      nextWindow: {
        poiId: 'poi_b',
        activityId: 'item_b',
        lastEntryAt: '16:00',
        timezone: 'Atlantic/Reykjavik',
        sourceProvider: 'test',
        confidence: 1,
      },
    });
    expect(ok).toBe(false);
  });

  it('Case 4: shorten enough → candidate accepted', () => {
    const ok = evaluateShortenCandidateFeasible({
      observationAt: HARNESS_OBSERVED_LATE,
      remainingStayMinutes: HARNESS_REMAINING_STAY,
      shortenMinutes: 50,
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
      nextWindow: {
        poiId: 'poi_b',
        activityId: 'item_b',
        lastEntryAt: '16:00',
        timezone: 'Atlantic/Reykjavik',
        sourceProvider: 'test',
        confidence: 1,
      },
    });
    expect(ok).toBe(true);
  });

  it('Case 5: remove next activity → plan feasible (revalidation)', async () => {
    const { stack: s } = stack();
    const run = await s.runner.runFullFromObservation(buildHarnessObservation(), {
      remainingStayMinutes: HARNESS_REMAINING_STAY,
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
    });
    const impact = {
      nextWindow: {
        poiId: 'poi_b',
        activityId: 'item_b',
        lastEntryAt: '16:00',
        timezone: 'Atlantic/Reykjavik',
        sourceProvider: 'test',
        confidence: 1,
      },
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
      shortenDeltaMinutes: 50,
      assessment: { infeasible: true, slipMinutes: 35, projectedEta: '2026-07-12T16:18:00.000Z' },
      currentActivityId: HARNESS_ACTIVITY_A,
      nextActivityId: 'item_b',
      affectedPlanItemIds: [HARNESS_ACTIVITY_A, 'item_b'],
      affectedEntityRefs: [],
      tripId: HARNESS_EXEC_TRIP_ID,
    } as any;

    const rev = evaluateExecutionSlipRevalidation({
      problem: run.problem!,
      impact,
      appliedCandidateId: EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY,
      observedAt: HARNESS_OBSERVED_LATE,
      remainingStayMinutesAfterApply: 0,
    });
    expect(rev.executionStatus).toBe('RESOLVED');
  });

  it('Case 6: substitute next activity → revalidation RESOLVED', async () => {
    const { stack: s } = stack();
    const run = await s.runner.runFullFromObservation(buildHarnessObservation(), {
      remainingStayMinutes: HARNESS_REMAINING_STAY,
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
    });
    const impact = {
      nextWindow: {
        poiId: 'poi_b',
        activityId: 'item_b',
        lastEntryAt: '16:00',
        timezone: 'Atlantic/Reykjavik',
        sourceProvider: 'test',
        confidence: 1,
      },
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
      shortenDeltaMinutes: 50,
      assessment: { infeasible: true, slipMinutes: 35, projectedEta: '2026-07-12T16:18:00.000Z' },
      currentActivityId: HARNESS_ACTIVITY_A,
      nextActivityId: 'item_b',
      affectedPlanItemIds: [],
      affectedEntityRefs: [],
      tripId: HARNESS_EXEC_TRIP_ID,
    } as any;

    const rev = evaluateExecutionSlipRevalidation({
      problem: run.problem!,
      impact,
      appliedCandidateId: EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY,
      observedAt: HARNESS_OBSERVED_LATE,
      remainingStayMinutesAfterApply: HARNESS_REMAINING_STAY,
    });
    expect(rev.executionStatus).toBe('RESOLVED');
  });

  it('Case 7: idempotent observation record', async () => {
    const { mock, stack: s } = stack();
    const slipService = new ExecutionDepartureSlipService(
      mock as unknown as PrismaService,
      s.observationStore,
      s.runner,
    );
    const body = {
      activityId: HARNESS_ACTIVITY_A,
      observedAt: HARNESS_OBSERVED_LATE,
      stillAtPoi: true,
      source: 'USER_REPORT' as const,
      idempotencyKey: 'idem_harness_1',
    };
    const first = await slipService.recordDepartureSlip(
      HARNESS_EXEC_TRIP_ID,
      'user_harness',
      body,
    );
    const second = await slipService.recordDepartureSlip(
      HARNESS_EXEC_TRIP_ID,
      'user_harness',
      body,
    );
    expect(first.observationId).toBe(second.observationId);
  });

  it('Case 8: apply + revalidation → RESOLVED via remove next', async () => {
    const { stack: s } = stack();
    const run = await s.runner.runFullFromObservation(buildHarnessObservation(), {
      remainingStayMinutes: HARNESS_REMAINING_STAY,
      travelDurationMinutes: HARNESS_TRAVEL_MINUTES,
    });
    expect(run.record).not.toBeNull();

    const choice =
      run.workspace!.repairCandidates.find(
        (c) => c.candidateId === EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY,
      )?.candidateId ?? EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY;

    await s.authorization.authorize({
      tripId: HARNESS_EXEC_TRIP_ID,
      decisionId: run.record!.decisionId,
      choice,
    });

    const key = buildPlanVersionIdempotencyKey(
      HARNESS_EXEC_TRIP_ID,
      run.record!.decisionId,
    );
    const applied = await s.executor.execute({
      tripId: HARNESS_EXEC_TRIP_ID,
      decisionId: run.record!.decisionId,
      idempotencyKey: key,
    });
    expect(applied.planVersion.planVersionId).toBeDefined();
    expect(
      await s.planVersionStore.getEffectivePlanVersionId(HARNESS_EXEC_TRIP_ID),
    ).toBe(applied.planVersion.planVersionId);
  });

  it('Case 9: legacy direct write blocked when W-01 enabled', () => {
    process.env.EFFECTIVE_PLAN_WRITE_CHAIN = '1';
    expect(() => assertExecutionAdvisoryDirectApplyAllowed()).toThrow(BadRequestException);
  });

  it('Case 10: non-member trip access blocked', async () => {
    const { mock, stack: s } = stack();
    const slipService = new ExecutionDepartureSlipService(
      mock as unknown as PrismaService,
      s.observationStore,
      s.runner,
    );
    await expect(
      slipService.recordDepartureSlip(HARNESS_EXEC_TRIP_ID, 'user_outsider', {
        activityId: HARNESS_ACTIVITY_A,
        observedAt: HARNESS_OBSERVED_LATE,
        stillAtPoi: true,
        source: 'USER_REPORT',
      }),
    ).rejects.toThrow(/成员/);
  });
});
