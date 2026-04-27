import { SideEffectParamResolverService } from './side-effect-param-resolver.service';
import { SideEffectRuleSyncerService } from './side-effect-rule-syncer.service';

describe('SideEffectRuleSyncerService.persistSinglePatch', () => {
  it('merges with existing DB params, upserts, and sets resolver exact cell', async () => {
    const resolver = new SideEffectParamResolverService();
    const mockTx = {
      decisionRuleConfig: {
        findUnique: jest.fn().mockResolvedValue({
          actionName: 'trip.apply_user_edit',
          handlerId: 'side_effect.financial_hold.book_flight_v1',
          params: { ttl_seconds: 900, hold_ratio: 0.5 },
          isActive: true,
        }),
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn(),
      },
    };
    const prisma: any = {
      isDbConnected: () => true,
      $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      decisionRuleConfig: {
        aggregate: jest.fn().mockResolvedValue({ _max: { updatedAt: new Date('2026-01-01') } }),
      },
    };
    const syncer = new SideEffectRuleSyncerService(prisma, resolver);
    const r = await syncer.persistSinglePatch('trip.apply_user_edit', 'side_effect.financial_hold.book_flight_v1', {
      hold_ratio: 0.1,
    });
    expect(r.merged).toEqual({ ttl_seconds: 900, hold_ratio: 0.1 });
    expect(r.deactivated).toBe(false);
    expect(mockTx.decisionRuleConfig.upsert).toHaveBeenCalled();
    expect(resolver.getSnapshot().overrides['trip.apply_user_edit']['side_effect.financial_hold.book_flight_v1']).toEqual(
      r.merged,
    );
  });

  it('deactivates in DB and clears resolver when params is null', async () => {
    const resolver = new SideEffectParamResolverService();
    resolver.setOverrideExact('a', 'h', { x: 1 });
    const mockTx = {
      decisionRuleConfig: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const prisma: any = {
      isDbConnected: () => true,
      $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) => cb(mockTx)),
      decisionRuleConfig: {
        aggregate: jest.fn().mockResolvedValue({ _max: { updatedAt: null as any } }),
      },
    };
    const syncer = new SideEffectRuleSyncerService(prisma, resolver);
    const r = await syncer.persistSinglePatch('a', 'h', null);
    expect(r.deactivated).toBe(true);
    expect(mockTx.decisionRuleConfig.updateMany).toHaveBeenCalled();
    expect(resolver.getSnapshot().overrides.a).toBeUndefined();
  });

  it('persistPatchBatch uses a single $transaction and one resolver bump', async () => {
    const resolver = new SideEffectParamResolverService();
    const txFn = jest.fn(async (cb: (tx: any) => Promise<unknown>) => {
      const tx = {
        decisionRuleConfig: {
          findUnique: jest.fn().mockResolvedValue(null),
          upsert: jest.fn().mockResolvedValue({}),
          updateMany: jest.fn(),
        },
      };
      return cb(tx);
    });
    const prisma: any = {
      isDbConnected: () => true,
      $transaction: txFn,
      decisionRuleConfig: {
        aggregate: jest.fn().mockResolvedValue({ _max: { updatedAt: new Date('2026-02-01') } }),
      },
    };
    const syncer = new SideEffectRuleSyncerService(prisma, resolver);
    const rev0 = resolver.getRevision();
    await syncer.persistPatchBatch([
      { action_name: 'trip.apply_user_edit', handler_id: 'h_one', params: { hold_ratio: 0.15 } },
      { action_name: 'trip.apply_user_edit', handler_id: 'h_two', params: { ttl_seconds: 600 } },
    ]);
    expect(txFn).toHaveBeenCalledTimes(1);
    expect(resolver.getRevision()).toBe(rev0 + 1);
    const snap = resolver.getSnapshot().overrides['trip.apply_user_edit'];
    expect(snap?.h_one).toEqual({ hold_ratio: 0.15 });
    expect(snap?.h_two).toEqual({ ttl_seconds: 600 });
  });
});
