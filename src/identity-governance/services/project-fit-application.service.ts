import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FIT_RESULT_LABELS } from '../constants/project-fit.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { ProjectEligibilityRuleService } from './project-eligibility-rule.service';
import { ProjectMembershipService } from './project-membership.service';
import { IdentityGovernanceEventService } from './identity-governance-event.service';
import { deriveLeaderRecommendation } from '../utils/fit-questionnaire.util';
import { summarizeEnrollmentForApplication } from '../../gate1/utils/gate1-project-fit-bridge.util';
import { Gate1ProjectFitBridgeService } from '../../gate1/services/gate1-project-fit-bridge.service';

export type SubmitApplicationWithFitInput = {
  fitAssessmentId: string;
  message?: string;
};

export type LeaderApplicationDecisionInput = {
  decision: 'APPROVE' | 'APPROVE_AFTER_CLARIFICATION' | 'WAITLIST' | 'REJECT' | 'REVOKE_APPROVAL';
  structuredRejectReason?: string;
  notes?: string;
};

@Injectable()
export class ProjectFitApplicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly eligibilityRules: ProjectEligibilityRuleService,
    private readonly projectMembership: ProjectMembershipService,
    private readonly domainEvents: IdentityGovernanceEventService,
    private readonly portalBridge: Gate1ProjectFitBridgeService,
  ) {}

  async submitWithAssessment(userId: string, listingId: string, input: SubmitApplicationWithFitInput) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.listingStatus !== 'published') {
      throw new NotFoundException('项目不存在或未发布');
    }
    if (listing.responsibleUserId === userId || listing.createdByUserId === userId) {
      throw new BadRequestException('不能申请自己发布的项目');
    }

    const assessment = await this.prisma.projectFitAssessment.findUnique({
      where: { id: input.fitAssessmentId },
    });
    if (!assessment || assessment.userId !== userId || assessment.listingId !== listingId) {
      throw new BadRequestException('无效的项目适合度评估');
    }
    if (assessment.status !== 'COMPLETED') {
      throw new BadRequestException('请先完成适合度评估');
    }
    if (assessment.overallResult === 'NOT_RECOMMENDED') {
      throw new BadRequestException('当前评估结论为不建议加入，请修正条件或联系领队');
    }

    const currentVersion = await this.eligibilityRules.getRuleSnapshotVersion(listingId);
    if (assessment.ruleSnapshotVersion < currentVersion) {
      throw new BadRequestException('项目规则已更新，请重新完成适合度评估后再申请');
    }

    const application = await this.prisma.trustedProjectApplication.upsert({
      where: { listingId_applicantUserId: { listingId, applicantUserId: userId } },
      create: {
        listingId,
        applicantUserId: userId,
        fitAssessmentId: input.fitAssessmentId,
        message: input.message?.trim() || null,
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
      },
      update: {
        fitAssessmentId: input.fitAssessmentId,
        message: input.message?.trim() || null,
        status: 'UNDER_REVIEW',
        submittedAt: new Date(),
        leaderDecision: null,
        structuredRejectReason: null,
        leaderNotes: null,
        decidedAt: null,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'APPLICATION_SUBMITTED',
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: application.id,
      after: {
        fitAssessmentId: input.fitAssessmentId,
        overallResult: assessment.overallResult,
        status: 'UNDER_REVIEW',
      },
    });

    return {
      ...application,
      fitSummary: this.buildFitSummary(assessment),
    };
  }

  async listReviewQueue(managerUserId: string, listingId: string) {
    await this.assertManagerByListingId(listingId, managerUserId);

    const applications = await this.prisma.trustedProjectApplication.findMany({
      where: {
        listingId,
        status: {
          in: ['UNDER_REVIEW', 'NEEDS_CLARIFICATION', 'WAITLISTED', 'APPROVED', 'SUBMITTED'],
        },
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      include: {
        fitAssessment: true,
      },
    });

    return applications.map((app) => {
      const assessment = app.fitAssessment;
      const teamImpact = (assessment?.teamImpactResult as { level?: string } | null)?.level ?? 'LOW';
      const hardResults = (assessment?.hardResults as Array<{ passed: boolean; severity: string }>) ?? [];
      const requiredConfirmations = (assessment?.requiredConfirmations as string[]) ?? [];

      return {
        applicationId: app.id,
        applicantUserId: app.applicantUserId,
        status: app.status,
        submittedAt: app.submittedAt,
        fitAssessmentId: assessment?.id ?? null,
        fitSummary: assessment
          ? {
              overallResult: assessment.overallResult,
              overallResultLabel:
                FIT_RESULT_LABELS[assessment.overallResult as keyof typeof FIT_RESULT_LABELS],
              teamImpactLevel: teamImpact,
              hardBlockers: hardResults.filter((r) => r.severity === 'BLOCKER' && !r.passed).length,
              pendingConfirmations: requiredConfirmations.length,
            }
          : null,
        systemRecommendation: assessment
          ? deriveLeaderRecommendation({
              overallResult: assessment.overallResult ?? 'CONDITIONAL',
              teamImpactLevel: teamImpact,
            })
          : 'CLARIFY',
      };
    });
  }

  async respondToClarification(userId: string, applicationId: string, message: string) {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
    });
    if (!application) throw new NotFoundException('申请不存在');
    if (application.applicantUserId !== userId) {
      throw new ForbiddenException('无权回复该申请');
    }
    if (application.status !== 'NEEDS_CLARIFICATION') {
      throw new BadRequestException('当前申请不在待补充沟通状态');
    }

    const updated = await this.prisma.trustedProjectApplication.update({
      where: { id: applicationId },
      data: {
        status: 'UNDER_REVIEW',
        message: message.trim(),
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'APPLICATION_CLARIFICATION_SUBMITTED',
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: applicationId,
    });

    return updated;
  }

  async leaderDecision(
    managerUserId: string,
    applicationId: string,
    input: LeaderApplicationDecisionInput,
  ) {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: { listing: true, fitAssessment: true },
    });
    if (!application) throw new NotFoundException('申请不存在');
    await this.assertManager(application.listing, managerUserId);

    if (input.decision === 'REJECT' && !input.structuredRejectReason) {
      throw new BadRequestException('拒绝申请必须选择结构化原因');
    }

    const previousStatus = application.status;
    let status = application.status;

    if (input.decision === 'APPROVE') {
      status = 'APPROVED';
    } else if (input.decision === 'APPROVE_AFTER_CLARIFICATION') {
      status = 'NEEDS_CLARIFICATION';
    } else if (input.decision === 'WAITLIST') {
      status = 'WAITLISTED';
    } else if (input.decision === 'REJECT') {
      status = 'REJECTED';
    } else if (input.decision === 'REVOKE_APPROVAL') {
      status = 'APPROVAL_REVOKED';
    }

    const updated = await this.prisma.trustedProjectApplication.update({
      where: { id: applicationId },
      data: {
        status,
        leaderDecision: input.decision,
        structuredRejectReason: input.structuredRejectReason ?? null,
        leaderNotes: input.notes ?? null,
        decidedAt: new Date(),
        ...(status === 'APPROVED'
          ? this.buildCommitmentFields(application.listing.commercialType, application.listing.budgetMinCents)
          : {}),
      },
    });

    if (status === 'APPROVED' && previousStatus !== 'APPROVED') {
      await this.prisma.trustedProjectListing.update({
        where: { id: application.listingId },
        data: { slotsFilled: { increment: 1 } },
      });
    }
    if (previousStatus === 'APPROVED' && status !== 'APPROVED' && status !== 'USER_CONFIRMED') {
      await this.prisma.trustedProjectListing.update({
        where: { id: application.listingId },
        data: { slotsFilled: { decrement: 1 } },
      });
    }

    await this.auditLog.record({
      actorId: managerUserId,
      action: 'APPLICATION_DECISION',
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: applicationId,
      after: { decision: input.decision, status },
    });

    if (status === 'APPROVED' && previousStatus !== 'APPROVED') {
      await this.domainEvents.emit({
        type: 'application.approved',
        actorId: managerUserId,
        targetType: 'TRUSTED_PROJECT_APPLICATION',
        targetId: applicationId,
        payload: {
          applicantUserId: application.applicantUserId,
          listingId: application.listingId,
          listingTitle: application.listing.title,
        },
      });
    }

    return updated;
  }

  async userConfirm(userId: string, applicationId: string) {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: { listing: true },
    });
    if (!application) throw new NotFoundException('申请不存在');
    if (application.applicantUserId !== userId) {
      throw new ForbiddenException('无权确认该申请');
    }
    if (application.status !== 'APPROVED') {
      throw new BadRequestException('仅已通过审核的申请可双向确认');
    }
    if (
      application.commitmentStatus === 'DEPOSIT_REQUIRED' &&
      application.listing.commercialType === 'COMMERCIAL'
    ) {
      throw new BadRequestException('商业项目需先完成定金确认后再加入');
    }

    const updated = await this.prisma.trustedProjectApplication.update({
      where: { id: applicationId },
      data: {
        status: application.listing.tripId ? 'JOINED' : 'USER_CONFIRMED',
        userConfirmedAt: new Date(),
      },
    });

    if (application.listing.tripId) {
      await this.projectMembership.joinFromTrustedApplication(
        application.listing.tripId,
        userId,
      );
    }

    await this.auditLog.record({
      actorId: userId,
      action: application.listing.tripId ? 'APPLICATION_JOINED' : 'APPLICATION_USER_CONFIRMED',
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: applicationId,
    });

    await this.domainEvents.emit({
      type: application.listing.tripId ? 'application.joined' : 'application.user_confirmed',
      actorId: userId,
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: applicationId,
      payload: {
        listingId: application.listingId,
        tripId: application.listing.tripId,
        status: updated.status,
      },
    });

    return updated;
  }

  async getApplicationDetail(requesterId: string, applicationId: string) {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: { fitAssessment: true, listing: true },
    });
    if (!application) throw new NotFoundException('申请不存在');

    const isApplicant = application.applicantUserId === requesterId;
    const isManager =
      application.listing.responsibleUserId === requesterId ||
      application.listing.createdByUserId === requesterId;
    if (!isApplicant && !isManager) {
      throw new ForbiddenException('无权查看该申请');
    }

    return {
      id: application.id,
      listingId: application.listingId,
      status: application.status,
      message: application.message,
      leaderDecision: application.leaderDecision,
      structuredRejectReason: application.structuredRejectReason,
      leaderNotes: isManager ? application.leaderNotes : undefined,
      submittedAt: application.submittedAt,
      decidedAt: application.decidedAt,
      userConfirmedAt: application.userConfirmedAt,
      fitAssessment: application.fitAssessment
        ? {
            id: application.fitAssessment.id,
            ...this.buildFitSummary(application.fitAssessment),
          }
        : null,
      commitmentStatus: application.commitmentStatus,
      depositAmountCents: application.depositAmountCents,
      ...(await this.portalBridge.getPortalSummaryForApplication(applicationId)),
    };
  }

  async listMyApplications(
    userId: string,
    filters?: { status?: string; limit?: number; cursor?: string },
  ) {
    const limit = Math.min(filters?.limit ?? 20, 50);
    const applications = await this.prisma.trustedProjectApplication.findMany({
      where: {
        applicantUserId: userId,
        ...(filters?.status ? { status: filters.status } : {}),
        ...(filters?.cursor ? { id: { gt: filters.cursor } } : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      take: limit + 1,
      include: { listing: true, fitAssessment: true },
    });

    const hasMore = applications.length > limit;
    const items = hasMore ? applications.slice(0, limit) : applications;
    const portalMap = await this.buildPortalSummaryMap(items.map((a) => a.id));

    return {
      items: items.map((app) => ({
        ...this.toApplicationCenterItem(app, 'applicant'),
        ...portalMap.get(app.id) ?? { portalEnrolled: false },
      })),
      nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null,
    };
  }

  async listLeaderApplicationCenter(
    managerUserId: string,
    filters?: { listingId?: string; status?: string; limit?: number },
  ) {
    const limit = Math.min(filters?.limit ?? 30, 100);
    const listings = filters?.listingId
      ? await this.prisma.trustedProjectListing.findMany({
          where: {
            id: filters.listingId,
            OR: [{ responsibleUserId: managerUserId }, { createdByUserId: managerUserId }],
          },
        })
      : await this.prisma.trustedProjectListing.findMany({
          where: {
            OR: [{ responsibleUserId: managerUserId }, { createdByUserId: managerUserId }],
          },
          orderBy: { updatedAt: 'desc' },
          take: 50,
        });

    if (listings.length === 0) {
      throw new ForbiddenException('无权查看申请中心');
    }

    const listingIds = listings.map((l) => l.id);
    const applications = await this.prisma.trustedProjectApplication.findMany({
      where: {
        listingId: { in: listingIds },
        ...(filters?.status ? { status: filters.status } : {}),
      },
      orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
      take: limit,
      include: { listing: true, fitAssessment: true },
    });

    const summary = {
      total: applications.length,
      byStatus: applications.reduce<Record<string, number>>((acc, app) => {
        acc[app.status] = (acc[app.status] ?? 0) + 1;
        return acc;
      }, {}),
    };

    const portalMap = await this.buildPortalSummaryMap(applications.map((a) => a.id));

    return {
      summary,
      items: applications.map((app) => ({
        ...this.toApplicationCenterItem(app, 'leader'),
        ...portalMap.get(app.id) ?? { portalEnrolled: false },
      })),
    };
  }

  async recordDepositPaid(userId: string, applicationId: string) {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: { listing: true },
    });
    if (!application) throw new NotFoundException('申请不存在');
    if (application.applicantUserId !== userId) {
      throw new ForbiddenException('无权更新该申请');
    }
    if (application.commitmentStatus !== 'DEPOSIT_REQUIRED') {
      throw new BadRequestException('当前申请无需支付定金');
    }

    return this.prisma.trustedProjectApplication.update({
      where: { id: applicationId },
      data: { commitmentStatus: 'DEPOSIT_PAID' },
    });
  }

  private async buildPortalSummaryMap(applicationIds: string[]) {
    const map = new Map<string, ReturnType<typeof summarizeEnrollmentForApplication>>();
    if (!applicationIds.length) return map;

    const applications = await this.prisma.trustedProjectApplication.findMany({
      where: { id: { in: applicationIds } },
      select: { id: true, gate1ParticipantId: true },
    });

    const participantIds = applications
      .map((a) => a.gate1ParticipantId)
      .filter((id): id is string => Boolean(id));

    const byTrustedApp = await this.prisma.gate1Participant.findMany({
      where: { trustedApplicationId: { in: applicationIds } },
      include: { project: { select: { id: true, title: true } } },
    });

    const byId =
      participantIds.length > 0
        ? await this.prisma.gate1Participant.findMany({
            where: { id: { in: participantIds } },
            include: { project: { select: { id: true, title: true } } },
          })
        : [];

    const participants = [
      ...byTrustedApp,
      ...byId.filter((p) => !byTrustedApp.some((x) => x.id === p.id)),
    ];

    for (const app of applications) {
      const participant =
        participants.find((p) => p.trustedApplicationId === app.id) ??
        (app.gate1ParticipantId
          ? participants.find((p) => p.id === app.gate1ParticipantId)
          : undefined);
      if (participant?.project) {
        map.set(app.id, summarizeEnrollmentForApplication(participant, participant.project));
      }
    }

    return map;
  }

  private toApplicationCenterItem(
    app: {
      id: string;
      listingId: string;
      applicantUserId: string;
      status: string;
      submittedAt: Date | null;
      decidedAt: Date | null;
      userConfirmedAt: Date | null;
      commitmentStatus: string | null;
      depositAmountCents: number | null;
      listing: {
        id: string;
        title: string;
        destination: string;
        startDate: Date;
        commercialType: string;
      };
      fitAssessment: {
        id: string;
        overallResult: string | null;
        teamImpactResult: unknown;
        requiredConfirmations: unknown;
      } | null;
    },
    role: 'applicant' | 'leader',
  ) {
    return {
      applicationId: app.id,
      listingId: app.listingId,
      listingTitle: app.listing.title,
      destination: app.listing.destination,
      startDate: app.listing.startDate,
      commercialType: app.listing.commercialType,
      applicantUserId: role === 'leader' ? app.applicantUserId : undefined,
      status: app.status,
      submittedAt: app.submittedAt,
      decidedAt: app.decidedAt,
      userConfirmedAt: app.userConfirmedAt,
      commitmentStatus: app.commitmentStatus,
      depositAmountCents: app.depositAmountCents,
      fitSummary: app.fitAssessment ? this.buildFitSummary(app.fitAssessment) : null,
    };
  }

  private buildCommitmentFields(commercialType: string, budgetMinCents: number | null) {
    if (commercialType !== 'COMMERCIAL') {
      return { commitmentStatus: 'NOT_REQUIRED' as const, depositAmountCents: null };
    }
    const depositAmountCents = budgetMinCents ? Math.round(budgetMinCents * 0.2) : null;
    return {
      commitmentStatus: depositAmountCents ? ('DEPOSIT_REQUIRED' as const) : ('NOT_REQUIRED' as const),
      depositAmountCents,
    };
  }

  private buildFitSummary(assessment: {
    id: string;
    overallResult: string | null;
    teamImpactResult: unknown;
    requiredConfirmations: unknown;
  }) {
    const teamImpact = (assessment.teamImpactResult as { level?: string } | null)?.level ?? 'LOW';
    return {
      overallResult: assessment.overallResult,
      overallResultLabel:
        FIT_RESULT_LABELS[assessment.overallResult as keyof typeof FIT_RESULT_LABELS],
      teamImpactLevel: teamImpact,
      pendingConfirmations: ((assessment.requiredConfirmations as string[]) ?? []).length,
      systemRecommendation: deriveLeaderRecommendation({
        overallResult: assessment.overallResult ?? 'CONDITIONAL',
        teamImpactLevel: teamImpact,
      }),
    };
  }

  private async assertManager(
    listing: { id: string; responsibleUserId: string; createdByUserId: string },
    userId: string,
  ) {
    if (listing.responsibleUserId !== userId && listing.createdByUserId !== userId) {
      throw new ForbiddenException('无权审核该项目的申请');
    }
  }

  private async assertManagerByListingId(listingId: string, userId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new NotFoundException('项目不存在');
    await this.assertManager(listing, userId);
  }
}
