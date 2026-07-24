import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberOnboardingProfilesService } from './member-onboarding-profiles.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('MemberOnboardingProfilesService', () => {
  let service: MemberOnboardingProfilesService;

  const prisma = {
    trip: {
      findUnique: jest.fn(),
    },
    tripMemberInvite: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberOnboardingProfilesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(MemberOnboardingProfilesService);
  });

  it('returns submitted profiles and pending members for advisor roles', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      metadata: {
        memberOnboardingProfiles: {
          'user-done': {
            displayName: '已完成',
            tripRole: 'PAYER',
            completedAt: '2026-07-10T00:00:00.000Z',
            privateNotes: 'secret',
            privateNotesAuth: 'ANALYST_ONLY',
          },
        },
      },
      TripCollaborator: [
        { id: 'collab-advisor', userId: 'advisor-1', role: 'OWNER' },
        { id: 'collab-done', userId: 'user-done', role: 'PAYER' },
        { id: 'collab-pending', userId: 'user-pending', role: 'MEMBER' },
      ],
    });

    prisma.tripMemberInvite.findMany.mockResolvedValue([
      {
        inviteCode: 'done-code',
        label: '付款人',
        roleSlot: 'payer',
        acceptedByUserId: 'user-done',
        collaboratorId: 'collab-done',
        onboardingDraft: {
          draft: { displayName: '已完成' },
          currentStepId: null,
        },
      },
      {
        inviteCode: 'pending-code',
        label: '成员',
        roleSlot: 'leader',
        acceptedByUserId: 'user-pending',
        collaboratorId: 'collab-pending',
        onboardingDraft: {
          draft: { displayName: '待提交' },
          currentStepId: 'review',
        },
      },
    ]);

    prisma.user.findMany.mockResolvedValue([
      { id: 'user-pending', displayName: '待提交' },
    ]);

    const result = await service.getProfiles('trip-1', 'advisor-1');

    expect(result.tripId).toBe('trip-1');
    expect(result.trip_id).toBe('trip-1');
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0]).toMatchObject({
      userId: 'user-done',
      displayName: '已完成',
      advisorVisiblePrivateNotes: null,
    });
    expect(result.profiles[0]).not.toHaveProperty('privateNotes');
    expect(result.pendingMembers).toHaveLength(1);
    expect(result.pendingMembers[0]).toMatchObject({
      userId: 'user-pending',
      reason: 'onboarding_not_submitted',
      roleSlot: 'leader',
    });
    expect(result.pending_members).toEqual(result.pendingMembers);
  });

  it('throws when trip missing', async () => {
    prisma.trip.findUnique.mockResolvedValue(null);
    await expect(service.getProfiles('missing', 'advisor-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('throws when caller lacks advisor role', async () => {
    prisma.trip.findUnique.mockResolvedValue({
      id: 'trip-1',
      metadata: {},
      TripCollaborator: [{ id: 'collab-1', userId: 'member-1', role: 'MEMBER' }],
    });

    await expect(service.getProfiles('trip-1', 'member-1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
