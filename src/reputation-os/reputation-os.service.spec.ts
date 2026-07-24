import { BadRequestException } from '@nestjs/common';
import { ReputationOsService } from './reputation-os.service';

describe('ReputationOsService (unit)', () => {
  const reviewerId = '550e8400-e29b-41d4-a716-446655440000';
  const revieweeId = '660e8400-e29b-41d4-a716-446655440001';
  const campaignId = '770e8400-e29b-41d4-a716-446655440002';

  const mockCampaign = {
    id: campaignId,
    postId: 'post-1',
    status: 'active',
    participantIds: [reviewerId, revieweeId],
    triggerAt: new Date(),
    destinationLabel: '西北',
    tripEndDate: new Date('2026-07-10'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrisma = {
    reputationSurveyCampaign: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    reputationSurveySubmission: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    userReputationProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    userTravelProfile: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    matchSquareRecruitmentPost: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  const mockOdyssey = {
    getProfile: jest.fn().mockResolvedValue(null),
    persistIntakeProfile: jest.fn(),
  };

  let service: ReputationOsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ReputationOsService(mockPrisma as any, mockOdyssey as any);
  });

  it('rejects self-review', async () => {
    mockPrisma.reputationSurveyCampaign.findUnique.mockResolvedValue({
      ...mockCampaign,
      participantIds: [reviewerId, revieweeId],
    });

    await expect(
      service.submitSurvey(reviewerId, {
        campaignId,
        revieweeUserId: reviewerId,
        q1Overall: 5,
        q2PaceSync: 5,
        q3Communication: 5,
        q4Spending: 5,
        q5WouldAgain: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates submission and upserts reputation profile', async () => {
    mockPrisma.reputationSurveyCampaign.findUnique.mockResolvedValue(mockCampaign);
    mockPrisma.reputationSurveySubmission.findUnique.mockResolvedValue(null);
    mockPrisma.reputationSurveySubmission.create.mockResolvedValue({
      id: 'sub-1',
      revieweeUserId: revieweeId,
    });
    mockPrisma.reputationSurveySubmission.findMany.mockResolvedValue([
      {
        q1Overall: 5,
        q2PaceSync: 5,
        q3Communication: 5,
        q4Spending: 5,
        q5WouldAgain: 5,
      },
    ]);
    mockPrisma.reputationSurveySubmission.count.mockResolvedValue(1);
    mockPrisma.userReputationProfile.upsert.mockResolvedValue({});

    const result = await service.submitSurvey(reviewerId, {
      campaignId,
      revieweeUserId: revieweeId,
      q1Overall: 5,
      q2PaceSync: 5,
      q3Communication: 5,
      q4Spending: 5,
      q5WouldAgain: 5,
    });

    expect(result.revieweeUserId).toBe(revieweeId);
    expect(mockPrisma.userReputationProfile.upsert).toHaveBeenCalled();
  });
});
