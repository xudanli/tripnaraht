import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { ReputationSurveyCampaign } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OdysseyIntakeService } from '../odyssey-intake/odyssey-intake.service';
import {
  REPUTATION_PUSH_COPY,
  REPUTATION_SURVEY_QUESTIONS,
} from './config/survey-questions.config';
import { computeUserReputationAggregate } from './engine/reputation-aggregate.engine';
import { applySurveyScoresToProfile } from './engine/survey-profile-feedback.engine';
import type {
  PendingSurveyCampaignView,
  ReputationSurveySubmitResult,
  UserReputationAssets,
} from './types/reputation-os.types';
import type { SurveyScores } from './config/survey-questions.config';
import type { SubmitReputationSurveyDto } from './dto/reputation-os.dto';

const MS_48H = 48 * 60 * 60 * 1000;

@Injectable()
export class ReputationOsService {
  private readonly logger = new Logger(ReputationOsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly odysseyIntake: OdysseyIntakeService,
  ) {}

  getSurveyQuestions() {
    return {
      questions: REPUTATION_SURVEY_QUESTIONS,
      pushCopy: REPUTATION_PUSH_COPY,
      scale: { min: 1, max: 5 },
    };
  }

  async getMyReputation(userId: string): Promise<UserReputationAssets> {
    return this.loadUserReputationAssets(userId);
  }

  async getUserReputation(userId: string): Promise<UserReputationAssets> {
    return this.loadUserReputationAssets(userId);
  }

  async getAverageStars(userId: string): Promise<number | null> {
    const assets = await this.loadUserReputationAssets(userId);
    return assets.averageStars;
  }

  async getSafetyWarning(userId: string): Promise<string | null> {
    const row = await this.prisma.userReputationProfile.findUnique({
      where: { userId },
      select: { safetyWarning: true },
    });
    return row?.safetyWarning ?? null;
  }

  async listPendingSurveys(userId: string): Promise<{ campaigns: PendingSurveyCampaignView[] }> {
    const campaigns = await this.prisma.reputationSurveyCampaign.findMany({
      where: { status: 'active' },
      orderBy: { triggerAt: 'asc' },
    });

    const views: PendingSurveyCampaignView[] = [];

    for (const campaign of campaigns) {
      const participantIds = this.parseParticipantIds(campaign.participantIds);
      if (!participantIds.includes(userId)) continue;

      const view = await this.buildPendingCampaignView(campaign, userId, participantIds);
      if (!view.isComplete) {
        views.push(view);
      }
    }

    return { campaigns: views };
  }

  async submitSurvey(
    reviewerUserId: string,
    dto: SubmitReputationSurveyDto,
  ): Promise<ReputationSurveySubmitResult> {
    const campaign = await this.prisma.reputationSurveyCampaign.findUnique({
      where: { id: dto.campaignId },
    });
    if (!campaign || campaign.status !== 'active') {
      throw new NotFoundException('互评活动不存在或已结束');
    }

    const participantIds = this.parseParticipantIds(campaign.participantIds);
    if (!participantIds.includes(reviewerUserId)) {
      throw new ForbiddenException('你不在本次成行组中');
    }
    if (!participantIds.includes(dto.revieweeUserId)) {
      throw new BadRequestException('被评价用户不在本次成行组中');
    }
    if (dto.revieweeUserId === reviewerUserId) {
      throw new BadRequestException('不能评价自己');
    }

    const existing = await this.prisma.reputationSurveySubmission.findUnique({
      where: {
        campaignId_reviewerUserId_revieweeUserId: {
          campaignId: dto.campaignId,
          reviewerUserId,
          revieweeUserId: dto.revieweeUserId,
        },
      },
    });
    if (existing) {
      throw new BadRequestException('你已评价过该旅伴');
    }

    const submission = await this.prisma.reputationSurveySubmission.create({
      data: {
        campaignId: dto.campaignId,
        reviewerUserId,
        revieweeUserId: dto.revieweeUserId,
        q1Overall: dto.q1Overall,
        q2PaceSync: dto.q2PaceSync,
        q3Communication: dto.q3Communication,
        q4Spending: dto.q4Spending,
        q5WouldAgain: dto.q5WouldAgain,
      },
    });

    const revieweeReputation = await this.recomputeUserReputation(dto.revieweeUserId);

    await this.applyProfileFeedback(dto.revieweeUserId, {
      q1Overall: dto.q1Overall,
      q2PaceSync: dto.q2PaceSync,
      q3Communication: dto.q3Communication,
      q4Spending: dto.q4Spending,
      q5WouldAgain: dto.q5WouldAgain,
    });

    const campaignComplete = await this.maybeCloseCampaign(campaign.id, participantIds);

    return {
      submissionId: submission.id,
      campaignId: campaign.id,
      revieweeUserId: dto.revieweeUserId,
      campaignComplete,
      revieweeReputation,
    };
  }

  /** Cron / 手动：为到期招募帖创建互评活动 */
  async createDueCampaigns(limit = 50): Promise<number> {
    const now = new Date();
    const candidates = await this.prisma.matchSquareRecruitmentPost.findMany({
      where: {
        reputationCampaigns: { none: {} },
        slotsFilled: { gte: 1 },
      },
      include: {
        applications: { where: { status: 'approved' } },
      },
      take: limit * 3,
    });

    let created = 0;

    for (const post of candidates) {
      if (created >= limit) break;

      const triggerAt = this.computeTriggerAt(post.endDate);
      if (triggerAt > now) continue;

      const participantIds = [
        post.captainUserId,
        ...post.applications.map((a) => a.applicantUserId),
      ];
      const uniqueParticipants = [...new Set(participantIds)];

      if (uniqueParticipants.length < 2) continue;

      await this.prisma.reputationSurveyCampaign.create({
        data: {
          postId: post.id,
          status: 'active',
          participantIds: uniqueParticipants,
          triggerAt,
          destinationLabel: post.destination,
          tripEndDate: post.endDate,
        },
      });

      created += 1;
      this.logger.log(
        `[ReputationOS] campaign created post=${post.id} participants=${uniqueParticipants.length}`,
      );
    }

    return created;
  }

  private async recomputeUserReputation(userId: string): Promise<UserReputationAssets> {
    const submissions = await this.prisma.reputationSurveySubmission.findMany({
      where: { revieweeUserId: userId },
    });

    const aggregate = computeUserReputationAggregate(userId, submissions);

    await this.prisma.userReputationProfile.upsert({
      where: { userId },
      create: {
        userId,
        averageStars: aggregate.averageStars ?? 0,
        surveyCount: aggregate.surveyCount,
        tagCloud: aggregate.tagCloud,
        safetyWarning: aggregate.safetyWarning,
        internalRiskLevel: aggregate.internalRiskLevel,
        severeLowCount: aggregate.severeLowCount,
      },
      update: {
        averageStars: aggregate.averageStars ?? 0,
        surveyCount: aggregate.surveyCount,
        tagCloud: aggregate.tagCloud,
        safetyWarning: aggregate.safetyWarning,
        internalRiskLevel: aggregate.internalRiskLevel,
        severeLowCount: aggregate.severeLowCount,
      },
    });

    return {
      userId,
      averageStars: aggregate.averageStars,
      surveyCount: aggregate.surveyCount,
      tagCloud: aggregate.tagCloud,
      safetyWarning: aggregate.safetyWarning,
      internalRiskLevel: aggregate.internalRiskLevel,
      updatedAt: new Date().toISOString(),
    };
  }

  private async loadUserReputationAssets(userId: string): Promise<UserReputationAssets> {
    const row = await this.prisma.userReputationProfile.findUnique({ where: { userId } });

    if (!row || row.surveyCount === 0) {
      return {
        userId,
        averageStars: null,
        surveyCount: 0,
        tagCloud: [],
        safetyWarning: null,
        internalRiskLevel: 'none',
        updatedAt: null,
      };
    }

    return {
      userId,
      averageStars: row.averageStars,
      surveyCount: row.surveyCount,
      tagCloud: Array.isArray(row.tagCloud) ? (row.tagCloud as string[]) : [],
      safetyWarning: row.safetyWarning,
      internalRiskLevel: row.internalRiskLevel as UserReputationAssets['internalRiskLevel'],
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async buildPendingCampaignView(
    campaign: ReputationSurveyCampaign,
    userId: string,
    participantIds: string[],
  ): Promise<PendingSurveyCampaignView> {
    const others = participantIds.filter((id) => id !== userId);

    const submissions = await this.prisma.reputationSurveySubmission.findMany({
      where: { campaignId: campaign.id, reviewerUserId: userId },
      select: { revieweeUserId: true },
    });
    const rated = new Set(submissions.map((s) => s.revieweeUserId));

    const companionsToRate = await Promise.all(
      others.map(async (companionId) => {
        const display = await this.resolveDisplayName(companionId);
        return {
          userId: companionId,
          displayName: display.displayName,
          cardTitle: display.cardTitle,
          alreadyRated: rated.has(companionId),
        };
      }),
    );

    const isComplete = companionsToRate.every((c) => c.alreadyRated);

    return {
      id: campaign.id,
      postId: campaign.postId,
      destinationLabel: campaign.destinationLabel,
      tripEndDate: campaign.tripEndDate.toISOString().slice(0, 10),
      pushCopy: REPUTATION_PUSH_COPY,
      companionsToRate,
      isComplete,
    };
  }

  private async maybeCloseCampaign(
    campaignId: string,
    participantIds: string[],
  ): Promise<boolean> {
    const expectedPairs = participantIds.length * (participantIds.length - 1);
    const submissionCount = await this.prisma.reputationSurveySubmission.count({
      where: { campaignId },
    });

    if (submissionCount < expectedPairs) {
      return false;
    }

    await this.prisma.reputationSurveyCampaign.update({
      where: { id: campaignId },
      data: { status: 'closed' },
    });
    return true;
  }

  private async applyProfileFeedback(userId: string, scores: SurveyScores): Promise<void> {
    const profile = await this.odysseyIntake.getProfile(userId);
    if (!profile) return;

    const updated = applySurveyScoresToProfile(profile, scores);

    if (updated.profileRefreshPending) {
      await this.odysseyIntake.persistIntakeProfile(userId, updated);
    }
  }

  private async resolveDisplayName(
    userId: string,
  ): Promise<{ displayName: string; cardTitle: string | null }> {
    const profile = await this.odysseyIntake.getProfile(userId);
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const ext = row?.extendedProfile as Record<string, unknown> | null;
    const trust = ext?.odyssey_trust as { displayName?: string } | undefined;

    const cardTitle = profile?.card.title ?? null;
    return {
      displayName: trust?.displayName ?? cardTitle ?? `旅伴${userId.slice(0, 6)}`,
      cardTitle,
    };
  }

  private computeTriggerAt(endDate: Date): Date {
    return new Date(endDate.getTime() + MS_48H);
  }

  private parseParticipantIds(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.filter((id): id is string => typeof id === 'string');
  }
}
