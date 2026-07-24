import { RiskRefreshTriggerType } from '../../../generated/execution-risk-contracts';
import { ActiveRiskRefreshService } from './active-risk-refresh.service';
import { EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY } from '../knowledge/active-risk-snapshot.types';
import { buildHarnessActiveRisks } from '../harness/execution-risk-p0.harness.util';

describe('ActiveRiskRefreshService', () => {
  const tripId = 'trip_er_harness_001';
  const userId = 'user-1';

  beforeEach(() => {
    delete process.env.EXECUTION_RISK_POST_CONFIRM_REFRESH;
  });

  it('persists ActiveRisk snapshot to trip.metadata on refresh', async () => {
    const risks = buildHarnessActiveRisks();

    const aggregation = {
      snapshotActiveRisks: jest.fn(async () => risks),
    };
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({ metadata: {} })),
        update: jest.fn(async ({ data }) => ({ metadata: data.metadata })),
      },
    };

    const service = new ActiveRiskRefreshService(aggregation as never, prisma as never);
    const result = await service.refresh({
      tripId,
      triggerType: RiskRefreshTriggerType.PLAN_VERSION_CHANGED,
      triggerRef: 'dp_wind_001',
      expectedPlanVersionId: 'pv_v11',
      refreshedBy: userId,
    });

    expect(result.activeRiskCount).toBe(risks.length);
    expect(result.snapshotId).toMatch(/^ers_/);
    expect(prisma.trip.update).toHaveBeenCalled();
    const meta = prisma.trip.update.mock.calls[0]?.[0]?.data?.metadata as Record<string, unknown>;
    const snapshot = meta[EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY] as { planVersionId: string };
    expect(snapshot.planVersionId).toBe('pv_v11');
  });

  it('refreshAfterPlanConfirm is gated by EXECUTION_RISK_POST_CONFIRM_REFRESH', async () => {
    const service = new ActiveRiskRefreshService(
      { snapshotActiveRisks: jest.fn() } as never,
      { trip: { findUnique: jest.fn(), update: jest.fn() } } as never,
    );

    const off = await service.refreshAfterPlanConfirm({
      tripId,
      userId,
      planVersionId: 'pv_v11',
      decisionId: 'dp_1',
    });
    expect(off).toBeNull();

    process.env.EXECUTION_RISK_POST_CONFIRM_REFRESH = '1';
    const aggregation = {
      snapshotActiveRisks: jest.fn(async () => []),
    };
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({ metadata: {} })),
        update: jest.fn(async () => ({})),
      },
    };
    const enabled = new ActiveRiskRefreshService(aggregation as never, prisma as never);
    const on = await enabled.refreshAfterPlanConfirm({
      tripId,
      userId,
      planVersionId: 'pv_v11',
      decisionId: 'dp_1',
    });
    expect(on?.snapshotId).toMatch(/^ers_/);
  });
});
