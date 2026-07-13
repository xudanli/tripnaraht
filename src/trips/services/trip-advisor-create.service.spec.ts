import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TripAdvisorCreateService } from './trip-advisor-create.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectMembershipService } from '../../identity-governance/services/project-membership.service';

describe('TripAdvisorCreateService', () => {
  let service: TripAdvisorCreateService;

  const tx = {
    trip: { create: jest.fn() },
    tripDay: { create: jest.fn() },
    tripCollaborator: { upsert: jest.fn() },
    tripMemberInvite: { create: jest.fn(), findUnique: jest.fn().mockResolvedValue(null) },
    projectMembership: { upsert: jest.fn() },
  };

  const prisma = {
    $transaction: jest.fn(async (fn: (client: typeof tx) => Promise<void>) => fn(tx)),
    organizationMember: { findUnique: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripAdvisorCreateService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://app.test') },
        },
        {
          provide: ProjectMembershipService,
          useValue: { syncFromCollaborator: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(TripAdvisorCreateService);
  });

  it('creates trip and returns invite codes for unbound stakeholders', async () => {
    const result = await service.createFromAdvisor(
      {
        destination: 'IS',
        startDate: '2026-09-01',
        endDate: '2026-09-07',
        dayCount: 7,
        estimatedHeadcount: 10,
        totalBudget: 50000,
        primaryContact: { name: '张三', email: 'zhang@example.com' },
        payer: { name: '李四' },
        finalConfirmer: { name: '王五' },
        advisor: { name: '顾问A' },
        leader: { name: '领队B' },
      },
      'advisor-user-id',
    );

    expect(result.tripId).toBeTruthy();
    expect(tx.trip.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            source: 'advisor-create',
            tripCollaborationMode: 'advisor_led',
          }),
        }),
      }),
    );
    expect(tx.tripDay.create).toHaveBeenCalledTimes(7);
    expect(tx.tripCollaborator.upsert).toHaveBeenCalledTimes(1);
    expect(result.memberInviteCodes).toHaveLength(4);
    expect(result.memberInviteCodes[0]).toMatchObject({
      label: expect.any(String),
      inviteCode: expect.any(String),
      inviteUrl: expect.stringContaining('https://app.test/invite/'),
    });
  });
});
