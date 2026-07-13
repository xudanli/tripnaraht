import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { TripMemberInviteService } from './trip-member-invite.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { ProjectMembershipService } from '../../../identity-governance/services/project-membership.service';

describe('TripMemberInviteService', () => {
  let service: TripMemberInviteService;

  const inviteRow = {
    id: 'invite-1',
    tripId: 'trip-1',
    inviteCode: 'abc123',
    roleSlot: 'payer',
    label: '付款人',
    expiresAt: new Date(Date.now() + 86400000),
    status: 'PENDING',
    acceptedByUserId: null,
    collaboratorId: null,
    Trip: {
      id: 'trip-1',
      name: '冰岛 7 日',
      destination: 'IS',
      metadata: {},
    },
    onboardingDraft: null,
  };

  const tx = {
    tripCollaborator: {
      upsert: jest.fn().mockResolvedValue({ id: 'member-1' }),
    },
    tripMemberInvite: {
      update: jest.fn(),
    },
    tripMemberOnboardingDraft: {
      update: jest.fn(),
    },
    trip: {
      findUnique: jest.fn().mockResolvedValue({ metadata: {} }),
      update: jest.fn(),
    },
  };

  const prisma = {
    tripMemberInvite: {
      findUnique: jest.fn(),
    },
    tripMemberOnboardingDraft: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ displayName: '测试用户', email: 'u@test.com' }),
    },
    trip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripMemberInviteService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ProjectMembershipService,
          useValue: { syncFromCollaborator: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TripMemberInviteService);
  });

  it('returns preview for valid invite', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue(inviteRow);

    const preview = await service.getPreview('abc123');
    expect(preview).toMatchObject({
      inviteCode: 'abc123',
      tripId: 'trip-1',
      tripName: '冰岛 7 日',
      label: '付款人',
      expired: false,
      onboardingRequired: true,
    });
  });

  it('throws when invite missing', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue(null);
    await expect(service.getPreview('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accept binds user and marks invite accepted', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue(inviteRow);

    const result = await service.accept('abc123', 'user-1');
    expect(result).toEqual({ tripId: 'trip-1', memberId: 'member-1' });
    expect(tx.tripCollaborator.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tripId_userId: { tripId: 'trip-1', userId: 'user-1' } },
        create: expect.objectContaining({ role: 'PAYER' }),
      }),
    );
    expect(tx.tripMemberInvite.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'ACCEPTED', acceptedByUserId: 'user-1' }),
      }),
    );
  });

  it('accept is idempotent for same user', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue({
      ...inviteRow,
      status: 'ACCEPTED',
      acceptedByUserId: 'user-1',
      collaboratorId: 'member-1',
    });

    const result = await service.accept('abc123', 'user-1');
    expect(result).toEqual({ tripId: 'trip-1', memberId: 'member-1' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accept rejects when already taken by another user', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue({
      ...inviteRow,
      status: 'ACCEPTED',
      acceptedByUserId: 'other-user',
    });

    await expect(service.accept('abc123', 'user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
