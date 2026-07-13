import { Test, TestingModule } from '@nestjs/testing';
import { InviteResolverService } from './invite-resolver.service';
import { PrismaService } from '../../../prisma/prisma.service';

describe('InviteResolverService', () => {
  let service: InviteResolverService;

  const prisma = {
    tripMemberInvite: { findUnique: jest.fn() },
    collaborationTeamInvite: { findUnique: jest.fn() },
    gate1Participant: { findUnique: jest.fn() },
    trip: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.collaborationTeamInvite.findUnique.mockResolvedValue(null);
    prisma.gate1Participant.findUnique.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteResolverService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(InviteResolverService);
  });

  it('resolves trip_member invite first', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue({
      tripId: 'trip-1',
      inviteCode: 'code-1',
      label: '付款人',
      contactHint: '李四',
      expiresAt: new Date(Date.now() + 86400000),
      Trip: { id: 'trip-1', name: '冰岛团', destination: 'IS' },
    });

    const result = await service.resolve('code-1');
    expect(result).toMatchObject({
      kind: 'trip_member',
      token: 'code-1',
      targetPath: '/invite/code-1',
      preview: {
        title: '冰岛团',
        tripId: 'trip-1',
        label: '付款人',
        expired: false,
      },
    });
    expect(prisma.collaborationTeamInvite.findUnique).not.toHaveBeenCalled();
  });

  it('falls back to gate1 participant', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue(null);
    prisma.collaborationTeamInvite.findUnique.mockResolvedValue(null);
    prisma.gate1Participant.findUnique.mockResolvedValue({
      inviteToken: 'g1-token',
      displayName: '参与者A',
      inviteExpiresAt: null,
      inviteRevokedAt: null,
      project: { id: 'p1', title: 'Gate1 项目', destination: 'IS' },
    });

    const result = await service.resolve('g1-token');
    expect(result?.kind).toBe('gate1_participant');
    expect(result?.targetPath).toBe('/participant/invites/g1-token');
  });

  it('returns null when no invite matches', async () => {
    prisma.tripMemberInvite.findUnique.mockResolvedValue(null);
    const result = await service.resolve('unknown');
    expect(result).toBeNull();
  });
});
