import { SideEffectApplyFailedError, SideEffectRegistryService } from './side-effect-registry.service';

describe('SideEffectRegistryService (saga compensation)', () => {
  it('rolls back previously applied side effects when a later side effect fails', async () => {
    const financialHoldStore = {
      upsert: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(true),
    };
    const registry = new SideEffectRegistryService(financialHoldStore as any);

    const holdHandler = {
      id: 'side_effect.financial_hold.book_flight_v1',
      kind: 'FINANCIAL_HOLD',
      evidenceRequired: true,
      preview: jest.fn().mockResolvedValue(null),
      apply: jest.fn().mockResolvedValue({
        kind: 'FINANCIAL_HOLD',
        state_patch: {
          side_effects: {
            financial_holds: [
              { hold_id: 'hold_a1', action_id: 'a1', action_name: 'trip.book', expires_at: new Date(Date.now() + 60000).toISOString() },
            ],
          },
        },
      }),
      rollback: jest.fn().mockResolvedValue({
        kind: 'FINANCIAL_HOLD',
        state_patch: { side_effects: { financial_holds_released: [{ hold_id: 'hold_a1' }] } },
      }),
    };

    const paymentHandler = {
      id: 'side_effect.payment.capture_v1',
      kind: 'FINANCIAL_HOLD',
      evidenceRequired: true,
      preview: jest.fn().mockResolvedValue(null),
      apply: jest.fn().mockRejectedValue(new Error('NETWORK_TIMEOUT')),
    };

    registry.register(holdHandler as any);
    registry.register(paymentHandler as any);

    const ctx = {
      request_id: 'req-1',
      trip_id: 'trip-1',
      action_id: 'a1',
      action_name: 'trip.book',
      action_type: 'BOOK',
      target_type: 'FLIGHT',
      target_ref: 'x',
      state: {},
    };

    await expect(
      registry.applyMany(ctx as any, [
        { handlerId: holdHandler.id, params: {} },
        { handlerId: paymentHandler.id, params: {} },
      ]),
    ).rejects.toThrow(/SideEffect apply failed/);

    expect(holdHandler.apply).toHaveBeenCalledTimes(1);
    expect(paymentHandler.apply).toHaveBeenCalledTimes(1);
    expect(holdHandler.rollback).toHaveBeenCalledTimes(1);
    expect(financialHoldStore.expire).toHaveBeenCalledWith('hold_a1');
  });

  it('retries side effect apply with retry policy until success', async () => {
    const financialHoldStore = {
      upsert: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(true),
    };
    const prisma = {
      isDbConnected: jest.fn().mockReturnValue(true),
      decisionRuleConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            params: {
              sideEffectType: 'FINANCIAL_HOLD',
              retryStrategy: 'fixed_interval',
              maxRetry: 2,
              intervalMs: 0,
              enabled: true,
            },
          },
        ]),
      },
    };
    const registry = new SideEffectRegistryService(financialHoldStore as any, prisma as any);

    const holdHandler = {
      id: 'side_effect.financial_hold.book_flight_v1',
      kind: 'FINANCIAL_HOLD',
      evidenceRequired: true,
      preview: jest.fn().mockResolvedValue(null),
      apply: jest
        .fn()
        .mockRejectedValueOnce(new Error('TRANSIENT_1'))
        .mockRejectedValueOnce(new Error('TRANSIENT_2'))
        .mockResolvedValue({
          kind: 'FINANCIAL_HOLD',
          state_patch: {
            side_effects: {
              financial_holds: [
                { hold_id: 'hold_retry_ok', action_id: 'a1', action_name: 'trip.book', expires_at: new Date().toISOString() },
              ],
            },
          },
        }),
    };
    registry.register(holdHandler as any);

    const ctx = {
      request_id: 'req-1',
      trip_id: 'trip-1',
      action_id: 'a1',
      action_name: 'trip.book',
      action_type: 'BOOK',
      target_type: 'FLIGHT',
      target_ref: 'x',
      state: {},
    };

    const res = await registry.applyMany(ctx as any, [{ handlerId: holdHandler.id, params: {} }]);
    expect(res).toHaveLength(1);
    expect(holdHandler.apply).toHaveBeenCalledTimes(3);
    expect(prisma.decisionRuleConfig.findMany).toHaveBeenCalledTimes(1);
  });

  it('records retry_count in ledger when retries are exhausted', async () => {
    const financialHoldStore = {
      upsert: jest.fn().mockResolvedValue(undefined),
      expire: jest.fn().mockResolvedValue(true),
    };
    const prisma = {
      isDbConnected: jest.fn().mockReturnValue(true),
      decisionRuleConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            params: {
              sideEffectType: 'FINANCIAL_HOLD',
              retryStrategy: 'exponential_backoff',
              maxRetry: 2,
              intervalMs: 0,
              enabled: true,
            },
          },
        ]),
      },
    };
    const registry = new SideEffectRegistryService(financialHoldStore as any, prisma as any);
    const failingHandler = {
      id: 'side_effect.payment.capture_v1',
      kind: 'FINANCIAL_HOLD',
      evidenceRequired: true,
      preview: jest.fn().mockResolvedValue(null),
      apply: jest.fn().mockRejectedValue(new Error('GATEWAY_TIMEOUT')),
    };
    registry.register(failingHandler as any);

    const ctx = {
      request_id: 'req-1',
      trip_id: 'trip-1',
      action_id: 'a1',
      action_name: 'trip.book',
      action_type: 'BOOK',
      target_type: 'FLIGHT',
      target_ref: 'x',
      state: {},
    };

    try {
      await registry.applyMany(ctx as any, [{ handlerId: failingHandler.id, params: {} }]);
      throw new Error('Expected applyMany to throw SideEffectApplyFailedError');
    } catch (e: any) {
      const err = e as SideEffectApplyFailedError;
      expect(err.name).toBe('SideEffectApplyFailedError');
      expect(err.side_effects_ledger).toHaveLength(1);
      expect(err.side_effects_ledger[0]?.status).toBe('APPLY_FAILED');
      expect(err.side_effects_ledger[0]?.retry_count).toBe(2);
      expect(err.side_effects_ledger[0]?.last_error).toContain('GATEWAY_TIMEOUT');
    }

    expect(failingHandler.apply).toHaveBeenCalledTimes(3);
  });
});

