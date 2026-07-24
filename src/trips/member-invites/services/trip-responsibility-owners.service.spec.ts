import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TripResponsibilityOwnersService } from './trip-responsibility-owners.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('TripResponsibilityOwnersService', () => {
  let service: TripResponsibilityOwnersService;

  const trip = {
    id: 'trip-1',
    metadata: {
      stakeholders: {
        payer: { name: '李四', email: 'li@test.com' },
        leader: { name: '领队B' },
      },
    },
    TripCollaborator: [
      { id: 'collab-advisor', userId: 'advisor-1', role: 'OWNER' },
      { id: 'collab-payer', userId: 'payer-1', role: 'PAYER' },
    ],
  };

  const prisma = {
    trip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tripMemberInvite: {
      findMany: jest.fn().mockResolvedValue([
        {
          roleSlot: 'finalConfirmer',
          label: '最终确认人',
          status: 'PENDING',
          collaboratorId: null,
          acceptedByUserId: null,
        },
      ]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'advisor-1', displayName: '顾问A', email: 'a@test.com' },
        { id: 'payer-1', displayName: '李四', email: 'li@test.com' },
      ]),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripResponsibilityOwnersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(TripResponsibilityOwnersService);
  });

  it('builds default owners from collaborators and pending invites', async () => {
    prisma.trip.findUnique.mockResolvedValue(trip);

    const result = await service.getOwners('trip-1', 'advisor-1');
    expect(result.tripId).toBe('trip-1');
    expect(result.owners.planningOwner).toMatchObject({
      memberId: 'collab-advisor',
      userId: 'advisor-1',
      name: '顾问A',
    });
    expect(result.owners.paymentApprover).toMatchObject({
      memberId: 'collab-payer',
      userId: 'payer-1',
    });
    expect(result.owners.finalApprover).toMatchObject({
      inviteLabel: '最终确认人',
    });
    expect(result.owners.onTripLeader).toEqual(result.owners.executionOwner);
  });

  it('returns stored SSOT when present', async () => {
    const storedOwners = {
      planningOwner: { userId: 'x', name: 'Stored Advisor' },
      executionOwner: { userId: 'y' },
      paymentApprover: { userId: 'z' },
      finalApprover: { userId: 'f' },
      onTripLeader: { userId: 'y' },
      emergencyContact: { userId: 'e' },
    };
    prisma.trip.findUnique.mockResolvedValue({
      ...trip,
      metadata: {
        responsibilityOwners: storedOwners,
        responsibilityOwnersUpdatedAt: '2026-07-10T00:00:00.000Z',
      },
    });

    const result = await service.getOwners('trip-1', 'advisor-1');
    expect(result.owners.planningOwner.name).toBe('Stored Advisor');
    expect(result.updatedAt).toBe('2026-07-10T00:00:00.000Z');
    expect(prisma.tripMemberInvite.findMany).not.toHaveBeenCalled();
  });

  it('patch requires advisor or owner', async () => {
    prisma.trip.findUnique.mockResolvedValue(trip);

    await expect(
      service.patchOwners('trip-1', 'stranger', {
        owners: { paymentApprover: { userId: 'new-payer' } },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('patch merges owners into metadata', async () => {
    prisma.trip.findUnique.mockResolvedValue(trip);

    await service.patchOwners('trip-1', 'advisor-1', {
      owners: { paymentApprover: { userId: 'new-payer', name: '新付款人' } },
    });

    expect(prisma.trip.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'trip-1' },
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            responsibilityOwners: expect.objectContaining({
              paymentApprover: expect.objectContaining({ userId: 'new-payer' }),
            }),
          }),
        }),
      }),
    );
  });

  it('throws when trip missing', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.getOwners('missing', 'advisor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
