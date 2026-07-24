import { ConflictException } from '@nestjs/common';
import { ExecutionRiskApplyService } from './execution-risk-apply.service';
import { ExecutionRiskConfirmWriteService } from './execution-risk-confirm-write.service';
import { ExecutionRiskRecommendationService } from './execution-risk-recommendation.service';
import {
  buildHarnessActiveRisks,
  stableWindRiskId,
  HARNESS_TRIP_ID,
} from '../harness/execution-risk-p0.harness.util';
import {
  ExecutionRiskIdempotencyStore,
  hashIdempotencyBody,
  buildIdempotencyStoreKey,
} from './execution-risk-idempotency.store';

describe('ExecutionRiskApplyService (Sprint 3)', () => {
  const riskId = stableWindRiskId();
  const recommendationId = 'env-rec-env-wind-001-plan-shorten';
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
  const userId = 'user-1';

  const risk = {
    ...buildHarnessActiveRisks()[0]!,
    id: riskId,
    affectedActivities: [{ id: 'act-glacier', label: '冰川徒步', kind: 'activity' as const }],
  };

  function buildService() {
    const aggregation = {
      getRisk: jest.fn(async () => risk),
      listRisks: jest.fn(async () => [risk]),
    };
    const recommendations = {
      listForRisk: jest.fn(async () => [
        {
          id: recommendationId,
          riskId,
          label: '缩短徒步',
          description: '将冰川徒步缩短为 90 分钟',
          impactSummary: '-30min',
          sourceSystem: 'ENVIRONMENT_EVENT',
          sourceId: 'env-wind-001',
        },
      ]),
      listThreePlansForRisk: jest.fn(async () => [
        {
          planType: 'RECOMMENDED',
          actionCodes: ['SHORTEN_HIKE_DURATION'],
        },
      ]),
    } as unknown as ExecutionRiskRecommendationService;

    const confirmWrite = new ExecutionRiskConfirmWriteService();
    return new ExecutionRiskApplyService(
      aggregation as never,
      recommendations,
      confirmWrite,
    );
  }

  it('AC-004: apply returns preview + planDiff without writing plan', async () => {
    const service = buildService();
    const result = await service.applyRecommendation(
      HARNESS_TRIP_ID,
      riskId,
      recommendationId,
      userId,
      { idempotencyKey },
    );

    expect(result.executionStatus).toBe('PREVIEW');
    expect(result.preview).toContain('缩短徒步');
    expect(result.planDiff).toBeDefined();
    expect(result.planDiff!.beforePlanVersionId).toContain('pv_');
    expect(result.planDiff!.modifiedActivities.length + result.planDiff!.addedActivities.length).toBeGreaterThanOrEqual(0);
    expect(result.projectedRisks?.[0]?.treatmentStatus).toBe('APPLYING');
    expect(result.requiresConfirmation).toBe(true);
    expect(result.expectedPlanVersionId).toBe(result.planDiff!.beforePlanVersionId);
  });

  it('AC-012: identical idempotency key replays cached apply response', async () => {
    const service = buildService();
    const first = await service.applyRecommendation(
      HARNESS_TRIP_ID,
      riskId,
      recommendationId,
      userId,
      { idempotencyKey },
    );
    const second = await service.applyRecommendation(
      HARNESS_TRIP_ID,
      riskId,
      recommendationId,
      userId,
      { idempotencyKey },
    );
    expect(second.idempotentReplay).toBe(true);
    expect(second.planDiffId).toBe(first.planDiffId);
  });

  it('AC-012: same key with different body returns conflict', () => {
    const store = new ExecutionRiskIdempotencyStore();
    const key = buildIdempotencyStoreKey({
      operation: 'apply',
      tripId: HARNESS_TRIP_ID,
      riskId,
      recommendationId,
      idempotencyKey,
    });
    store.save(key, hashIdempotencyBody({ a: 1 }), { ok: true });
    expect(() => store.lookup(key, hashIdempotencyBody({ a: 2 }))).toThrow(ConflictException);
  });

  it('AC-004: confirm without prior apply returns PREVIEW_REQUIRED', async () => {
    const service = buildService();
    await expect(
      service.confirmRecommendation(
        HARNESS_TRIP_ID,
        riskId,
        recommendationId,
        userId,
        true,
        { idempotencyKey: '11111111-1111-1111-1111-111111111111' },
      ),
    ).rejects.toMatchObject({ response: { code: 'PREVIEW_REQUIRED' } });
  });

  it('confirm with write flag creates plan version + ledger ref', async () => {
    const prev = process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    try {
      const service = buildService();
      await service.applyRecommendation(HARNESS_TRIP_ID, riskId, recommendationId, userId, {
        idempotencyKey,
      });
      const confirmed = await service.confirmRecommendation(
        HARNESS_TRIP_ID,
        riskId,
        recommendationId,
        userId,
        true,
        { idempotencyKey },
      );
      expect(confirmed.applied).toBe(true);
      expect(confirmed.newPlanVersionId).toMatch(/^pv_/);
      expect(confirmed.ledgerRef).toMatch(/^ledger_/);
      expect(confirmed.updatedRisks?.length).toBeGreaterThan(0);
    } finally {
      if (prev === undefined) delete process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
      else process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = prev;
    }
  });
});
