import { ActiveRiskQueryService } from './active-risk-query.service';
import { EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY } from '../knowledge/active-risk-snapshot.types';
import { buildHarnessActiveRisks, HARNESS_TRIP_ID } from '../harness/execution-risk-p0.harness.util';

describe('ActiveRiskQueryService', () => {
  it('returns persisted snapshot when EXECUTION_RISK_SNAPSHOT_QUERY=1', async () => {
    process.env.EXECUTION_RISK_SNAPSHOT_QUERY = '1';
    const risks = buildHarnessActiveRisks();
    const prisma = {
      trip: {
        findUnique: jest.fn(async () => ({
          metadata: {
            [EXECUTION_RISK_ACTIVE_SNAPSHOT_KEY]: {
              snapshotId: 'ers_test',
              tripId: HARNESS_TRIP_ID,
              planVersionId: 'pv_v11',
              refreshedAt: new Date().toISOString(),
              triggerType: 'PLAN_VERSION_CHANGED',
              activeRiskCount: risks.length,
              clusterCount: 1,
              activeRisks: risks,
            },
          },
        })),
      },
    };
    const aggregation = { snapshotActiveRisks: jest.fn() };
    const service = new ActiveRiskQueryService(prisma as never, aggregation as never);

    const result = await service.listCurrentRisks(HARNESS_TRIP_ID, {
      planVersionId: 'pv_v11',
    });
    expect(result).toHaveLength(risks.length);
    expect(aggregation.snapshotActiveRisks).not.toHaveBeenCalled();

    delete process.env.EXECUTION_RISK_SNAPSHOT_QUERY;
  });
});
