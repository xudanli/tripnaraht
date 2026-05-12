import { DecisionExecutionReconciliationService } from './decision-execution-reconciliation.service';

describe('DecisionExecutionReconciliationService', () => {
  it('appends world fact when sync enabled and SUCCESS trace', async () => {
    process.env.DECISION_EXECUTION_WORLD_FACT_SYNC = '1';

    const append = jest.fn().mockResolvedValue({ id: 'wf1' });
    const prisma = {
      trip: { findUnique: jest.fn(), update: jest.fn() },
    };
    const config = {
      get: jest.fn((k: string) => (k === 'DECISION_EXECUTION_WORLD_FACT_SYNC' ? '1' : undefined)),
    };

    const svc = new DecisionExecutionReconciliationService(
      prisma as any,
      { append } as any,
      config as any,
    );

    const out = await svc.syncRouteDispatchOutcome({
      countryCode: 'IS',
      traces: [
        {
          actionIndex: 0,
          actionType: 'ROUTE_DEGRADE',
          status: 'SUCCESS',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      ],
      rollbackTokens: ['rb1'],
    });

    expect(out.worldFactAppended).toBe(true);
    expect(out.worldFactRowId).toBe('wf1');
    expect(append).toHaveBeenCalled();

    delete process.env.DECISION_EXECUTION_WORLD_FACT_SYNC;
  });

  it('skips world fact when no SUCCESS trace', async () => {
    const append = jest.fn();
    const prisma = { trip: { findUnique: jest.fn(), update: jest.fn() } };
    const config = { get: jest.fn().mockReturnValue('1') };

    const svc = new DecisionExecutionReconciliationService(prisma as any, { append } as any, config as any);

    const out = await svc.syncRouteDispatchOutcome({
      countryCode: 'IS',
      traces: [],
      rollbackTokens: [],
    });

    expect(out.worldFactAppended).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });
});
