import { SagaReconciliationCron } from './saga-reconciliation.cron';

describe('SagaReconciliationCron', () => {
  it('invokes reconciler on tick', async () => {
    const reconciler = {
      reconcileOnce: jest.fn().mockResolvedValue({ scanned: 1, attempted: 1, cleaned: 1 }),
    };
    const cron = new SagaReconciliationCron(reconciler as any);
    await cron.handleTick();
    expect(reconciler.reconcileOnce).toHaveBeenCalledWith({ take: 100 });
  });
});

