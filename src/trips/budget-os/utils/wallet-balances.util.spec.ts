import {
  buildWalletBalances,
  computeNetByUser,
  computeSharePerPerson,
} from './wallet-balances.util';
import type { LedgerEntry } from '../types/travel-wallet.types';

describe('wallet-balances.util', () => {
  const baseEntry = (
    overrides: Partial<LedgerEntry>,
  ): LedgerEntry => ({
    id: 'e1',
    tripId: 'trip-1',
    sourceType: 'manual',
    sourceId: 's1',
    title: 'test',
    category: 'food',
    amount: 400,
    currency: 'CNY',
    paidByUserId: 'u1',
    splitAmongUserIds: ['u1', 'u2', 'u3', 'u4'],
    sharePerPerson: 100,
    settled: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    ...overrides,
  });

  it('computes share per person for AA', () => {
    expect(computeSharePerPerson(400, 4)).toBe(100);
  });

  it('scenario 6: 4人 AA, u1 付 400 → others owe u1 100 each', () => {
    const entry = baseEntry({});
    const net = computeNetByUser([entry]);
    expect(net.u1).toBe(300);
    expect(net.u2).toBe(-100);
    expect(net.u3).toBe(-100);
    expect(net.u4).toBe(-100);

    const balances = buildWalletBalances([entry], 'CNY');
    expect(balances.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromUserId: 'u2', toUserId: 'u1', amount: 100 }),
        expect.objectContaining({ fromUserId: 'u3', toUserId: 'u1', amount: 100 }),
        expect.objectContaining({ fromUserId: 'u4', toUserId: 'u1', amount: 100 }),
      ]),
    );
  });

  it('ignores settled entries', () => {
    const net = computeNetByUser([baseEntry({ settled: true })]);
    expect(Object.keys(net)).toHaveLength(0);
  });
});
