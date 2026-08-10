import {
  allocateSharesCents,
  buildSettlementTransfers,
  computeMinimalTransfers,
  computeNetCents,
  confirmKey,
  countRawPairwiseEdges,
  resolveAutoOffsetLabel,
} from './settlement.util';

describe('team-ledger settlement.util', () => {
  it('allocates remainder cents stably by member id', () => {
    const shares = allocateSharesCents(100, ['b', 'a', 'c']);
    expect(shares.get('a')).toBe(34);
    expect(shares.get('b')).toBe(33);
    expect(shares.get('c')).toBe(33);
    expect([...shares.values()].reduce((s, n) => s + n, 0)).toBe(100);
  });

  it('computes net: payer +amount, splittees -share', () => {
    const net = computeNetCents([
      {
        amountCents: 10000,
        payerMemberId: 'xu',
        splitMemberIds: ['xu', 'li'],
      },
    ]);
    expect(net.xu).toBe(5000);
    expect(net.li).toBe(-5000);
  });

  it('produces minimal transfers', () => {
    const net = computeNetCents([
      {
        amountCents: 160000,
        payerMemberId: 'xu',
        splitMemberIds: ['xu', 'li', 'wang', 'chen'],
      },
      {
        amountCents: 40000,
        payerMemberId: 'li',
        splitMemberIds: ['xu', 'li'],
      },
    ]);
    const edges = computeMinimalTransfers(net);
    const totalOut = edges.reduce((s, e) => s + e.amountCents, 0);
    const positive = Object.values(net).filter((v) => v > 0).reduce((s, v) => s + v, 0);
    expect(totalOut).toBe(positive);
    expect(edges.length).toBeGreaterThan(0);
  });

  it('labels 互相欠款 when raw edges exceed minimal transfers', () => {
    const expenses = [
      {
        amountCents: 10000,
        payerMemberId: 'a',
        splitMemberIds: ['a', 'b'],
      },
      {
        amountCents: 6000,
        payerMemberId: 'b',
        splitMemberIds: ['a', 'b'],
      },
    ];
    const edges = computeMinimalTransfers(computeNetCents(expenses));
    expect(countRawPairwiseEdges(expenses)).toBeGreaterThan(edges.length);
    expect(resolveAutoOffsetLabel(expenses, edges)).toBe('互相欠款');
  });

  it('merges confirm status into settlement transfers', () => {
    const expenses = [
      {
        amountCents: 10000,
        payerMemberId: 'xu',
        splitMemberIds: ['xu', 'li'],
      },
    ];
    const memberById = new Map([
      [
        'xu',
        { id: 'xu', name: '徐', avatarUrl: null, participatesInSplit: true },
      ],
      [
        'li',
        { id: 'li', name: '李', avatarUrl: null, participatesInSplit: true },
      ],
    ]);
    const { transfers } = buildSettlementTransfers({
      tripId: 'trip_1',
      expenses,
      memberById,
      confirmKeys: new Set([confirmKey('li', 'xu', 5000)]),
    });
    expect(transfers).toHaveLength(1);
    expect(transfers[0].status).toBe('settled');
    expect(transfers[0].amountCents).toBe(5000);
  });
});
