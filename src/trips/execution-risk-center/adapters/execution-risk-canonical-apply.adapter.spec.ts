import { ExecutionRiskCanonicalApplyAdapter } from '../adapters/execution-risk-canonical-apply.adapter';
import { ExecutionRiskApplyService } from '../services/execution-risk-apply.service';
import { ExecutionRiskConfirmWriteService } from '../services/execution-risk-confirm-write.service';
import { ExecutionRiskRecommendationService } from '../services/execution-risk-recommendation.service';
import {
  buildHarnessActiveRisks,
  stableWindRiskId,
  HARNESS_TRIP_ID,
} from '../harness/execution-risk-p0.harness.util';

describe('ExecutionRiskCanonicalApplyAdapter', () => {
  const riskId = stableWindRiskId();
  const recommendationId = 'env-rec-env-wind-001-plan-shorten';
  const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';
  const userId = 'user-1';

  const risk = {
    ...buildHarnessActiveRisks()[0]!,
    id: riskId,
    affectedActivities: [{ id: 'act-glacier', label: '冰川徒步', kind: 'activity' as const }],
  };

  function buildAdapter() {
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

    const applyService = new ExecutionRiskApplyService(
      aggregation as never,
      recommendations,
      new ExecutionRiskConfirmWriteService(),
    );
    return new ExecutionRiskCanonicalApplyAdapter(applyService);
  }

  it('preview delegates to apply service and returns planDiff', async () => {
    const adapter = buildAdapter();
    const preview = await adapter.preview({
      tripId: HARNESS_TRIP_ID,
      riskId,
      recommendationId,
      requestedBy: userId,
      idempotencyKey,
    });

    expect(preview.requiresConfirmation).toBe(true);
    expect(preview.preview).toContain('缩短徒步');
    expect(preview.planDiff.beforePlanVersionId).toContain('pv_');
  });

  it('confirm delegates to apply service when write flag enabled', async () => {
    const prev = process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
    process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = '1';
    try {
      const adapter = buildAdapter();
      await adapter.preview({
        tripId: HARNESS_TRIP_ID,
        riskId,
        recommendationId,
        requestedBy: userId,
        idempotencyKey,
        expectedPlanVersionId: 'pv_v10',
      });
      const confirmed = await adapter.confirm({
        tripId: HARNESS_TRIP_ID,
        riskId,
        recommendationId,
        confirmedBy: userId,
        idempotencyKey,
        expectedPlanVersionId: 'pv_v10',
      });
      expect(confirmed.newPlanVersionId).toMatch(/^pv_/);
      expect(confirmed.ledgerRef).toMatch(/^ledger_/);
    } finally {
      if (prev === undefined) delete process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
      else process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED = prev;
    }
  });
});
