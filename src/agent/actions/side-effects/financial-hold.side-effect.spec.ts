import { FinancialHoldSideEffect } from './financial-hold.side-effect';

describe('FinancialHoldSideEffect', () => {
  it('respects params.ttl_seconds and params.hold_ratio', async () => {
    jest.useFakeTimers();
    const now = new Date('2026-01-01T00:00:00.000Z').getTime();
    jest.setSystemTime(now);

    const res = await FinancialHoldSideEffect.preview(
      {
        request_id: 'r1',
        trip_id: 't1',
        action_id: 'a1',
        action_name: 'trip.apply_user_edit',
        action_type: 'BOOK',
        target_type: 'FLIGHT',
        action_input: { price: 1000, currency: 'USD', wallet: { balance: 2000, currency: 'USD' } },
        state: { wallet: { balance: 2000, currency: 'USD' } },
      } as any,
      { ttl_seconds: 7200, hold_ratio: 0.2 },
    );

    expect(res?.kind).toBe('FINANCIAL_HOLD');
    expect(res?.expiresAt).toBe(new Date(now + 7200 * 1000).toISOString());
    expect((res as any)?.shadow_delta?.resources?.budget?.delta).toBe(-200);
    jest.useRealTimers();
  });
});

