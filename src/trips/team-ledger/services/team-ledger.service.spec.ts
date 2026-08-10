import { NotFoundException } from '@nestjs/common';
import { TeamLedgerService } from './team-ledger.service';
import {
  buildSettlementTransfers,
  confirmKey,
} from '../utils/settlement.util';

describe('TeamLedgerService.confirmTransfer', () => {
  it('upserts confirm and returns settled transfer', async () => {
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
    const built = buildSettlementTransfers({
      tripId: 'trip_1',
      expenses,
      memberById,
      confirmKeys: new Set(),
    });
    const edge = built.transfers[0]!;

    const upsert = jest.fn().mockResolvedValue({});
    const prisma = {
      tripLedgerExpense: {
        findMany: jest.fn().mockResolvedValue([
          {
            amountCents: 10000,
            payerMemberId: 'xu',
            splitMemberIds: ['xu', 'li'],
            currency: 'CNY',
            occurredAt: new Date(),
          },
        ]),
      },
      tripLedgerTransferConfirm: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert,
      },
    };
    const access = {
      assertTripMember: jest.fn().mockResolvedValue(undefined),
    };
    const members = {
      listMembers: jest.fn().mockResolvedValue([...memberById.values()]),
    };

    const svc = new TeamLedgerService(
      prisma as never,
      access as never,
      members as never,
    );

    const result = await svc.confirmTransfer('trip_1', edge.id, 'user_1');

    expect(result.transfer.id).toBe(edge.id);
    expect(result.transfer.status).toBe('settled');
    expect(result.confirmedAt).toMatch(/^\d{4}-/);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_fromMemberId_toMemberId_amountCents: {
            tripId: 'trip_1',
            fromMemberId: edge.from.id,
            toMemberId: edge.to.id,
            amountCents: edge.amountCents,
          },
        },
        create: expect.objectContaining({
          tripId: 'trip_1',
          fromMemberId: edge.from.id,
          toMemberId: edge.to.id,
          amountCents: edge.amountCents,
          status: 'settled',
        }),
      }),
    );
    expect(confirmKey(edge.from.id, edge.to.id, edge.amountCents)).toBe(
      `${edge.from.id}|${edge.to.id}|${edge.amountCents}`,
    );
  });

  it('404 when transferId not in current settlement graph', async () => {
    const prisma = {
      tripLedgerExpense: { findMany: jest.fn().mockResolvedValue([]) },
      tripLedgerTransferConfirm: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const access = {
      assertTripMember: jest.fn().mockResolvedValue(undefined),
    };
    const members = {
      listMembers: jest.fn().mockResolvedValue([]),
    };
    const svc = new TeamLedgerService(
      prisma as never,
      access as never,
      members as never,
    );

    await expect(
      svc.confirmTransfer('trip_1', 't_missing', 'user_1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
