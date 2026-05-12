import { ExecutionPlanningContextService } from './execution-planning-context.service';

describe('ExecutionPlanningContextService', () => {
  it('aggregates trip history hints for policy layer', async () => {
    const prisma = {
      trip: {
        findUnique: jest.fn().mockResolvedValue({
          metadata: {
            decisionExecutionHistory: [
              {
                id: '1',
                occurredAt: new Date().toISOString(),
                countryCode: 'IS',
                routeDirectionId: '42',
                traceSummary: [{ actionIndex: 0, actionType: 'ROUTE_DEGRADE', status: 'SUCCESS' }],
                rollbackTokenCount: 1,
                hadSuccessfulDispatch: true,
              },
            ],
          },
        }),
      },
    };
    const resolver = {
      resolveLatestByFactKey: jest.fn().mockResolvedValue(null),
    };

    const svc = new ExecutionPlanningContextService(prisma as any, resolver as any);
    const ctx = await svc.loadContext({ tripId: 't1', countryCode: 'IS' });

    expect(ctx?.hints.routeDegradeCountByRouteDirectionId['42']).toBe(1);
  });

  it('loads world dispatch signal and increments ambient', async () => {
    const prisma = { trip: { findUnique: jest.fn().mockResolvedValue(null) } };
    const resolver = {
      resolveLatestByFactKey: jest.fn().mockResolvedValue({
        fact: {
          id: 'wf',
          observedAt: new Date(),
          valueJson: {
            traces: [{ actionType: 'ROUTE_DEGRADE', status: 'SUCCESS' }],
          },
        },
        freshness: { isExpiredByValidTo: false, freshnessScore: 1 },
      }),
    };

    const svc = new ExecutionPlanningContextService(prisma as any, resolver as any);
    const ctx = await svc.loadContext({ countryCode: 'IS' });

    expect(ctx?.hints.ambientDegradeEvents).toBeGreaterThanOrEqual(1);
    expect(ctx?.lastCountryDispatchFact?.factId).toBe('wf');
  });
});
