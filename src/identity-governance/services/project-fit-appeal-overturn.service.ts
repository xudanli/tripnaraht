import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IdentityAuditLogService } from './audit-log.service';
import { IdentityGovernanceEventService } from './identity-governance-event.service';

const REOPENABLE_APPLICATION_STATUSES = ['REJECTED', 'APPROVAL_REVOKED'] as const;

@Injectable()
export class ProjectFitAppealOverturnService {
  private readonly logger = new Logger(ProjectFitAppealOverturnService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly domainEvents: IdentityGovernanceEventService,
  ) {}

  async applyOverturn(appeal: {
    id: string;
    submitterId: string;
    targetType: string;
    targetId: string;
    status: string;
  }): Promise<{ reopenedApplicationIds: string[]; resetAssessmentIds: string[] }> {
    if (!['UPHELD', 'PARTIALLY_UPHELD'].includes(appeal.status)) {
      return { reopenedApplicationIds: [], resetAssessmentIds: [] };
    }

    const reopenedApplicationIds: string[] = [];
    const resetAssessmentIds: string[] = [];

    if (appeal.targetType === 'APPLICATION' || appeal.targetType === 'ELIGIBILITY_DECISION') {
      const reopened = await this.reopenApplication(appeal.targetId, appeal.id, appeal.submitterId);
      if (reopened) reopenedApplicationIds.push(reopened);
    } else if (appeal.targetType === 'FIT_ASSESSMENT') {
      const assessmentId = appeal.targetId;
      await this.resetAssessmentForReEvaluation(assessmentId, appeal.id);
      resetAssessmentIds.push(assessmentId);

      const linkedApp = await this.prisma.trustedProjectApplication.findFirst({
        where: { fitAssessmentId: assessmentId },
      });
      if (linkedApp) {
        const reopened = await this.reopenApplication(linkedApp.id, appeal.id, appeal.submitterId);
        if (reopened) reopenedApplicationIds.push(reopened);
      }
    } else {
      this.logger.warn(`Unknown appeal targetType: ${appeal.targetType}`);
    }

    return { reopenedApplicationIds, resetAssessmentIds };
  }

  private async reopenApplication(
    applicationId: string,
    appealId: string,
    submitterId: string,
  ): Promise<string | null> {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: { listing: true },
    });
    if (!application) {
      this.logger.warn(`Appeal overturn: application ${applicationId} not found`);
      return null;
    }

    if (!REOPENABLE_APPLICATION_STATUSES.includes(application.status as (typeof REOPENABLE_APPLICATION_STATUSES)[number])) {
      this.logger.debug(
        `Appeal overturn: application ${applicationId} status=${application.status}, skip reopen`,
      );
      return null;
    }

    await this.prisma.trustedProjectApplication.update({
      where: { id: applicationId },
      data: {
        status: 'UNDER_REVIEW',
        leaderDecision: null,
        structuredRejectReason: null,
        leaderNotes: null,
        decidedAt: null,
        commitmentStatus: application.listing.commercialType === 'COMMERCIAL' ? null : 'NOT_REQUIRED',
        depositAmountCents: null,
      },
    });

    await this.auditLog.record({
      actorId: submitterId,
      action: 'APPLICATION_REOPENED_BY_APPEAL',
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: applicationId,
      after: { appealId, previousStatus: application.status },
    });

    await this.domainEvents.emit({
      type: 'appeal.application_reopened',
      actorId: submitterId,
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: applicationId,
      payload: { appealId, listingId: application.listingId },
    });

    return applicationId;
  }

  private async resetAssessmentForReEvaluation(assessmentId: string, appealId: string) {
    const assessment = await this.prisma.projectFitAssessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) return;

    await this.prisma.projectFitAssessment.update({
      where: { id: assessmentId },
      data: {
        status: 'IN_PROGRESS',
        overallResult: null,
        hardResults: Prisma.JsonNull,
        dimensionResults: Prisma.JsonNull,
        teamImpactResult: Prisma.JsonNull,
        requiredConfirmations: Prisma.JsonNull,
        evaluatedAt: null,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        explanationBundle: {
          reopenedByAppealId: appealId,
          reopenedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });

    await this.auditLog.record({
      actorId: assessment.userId,
      action: 'FIT_ASSESSMENT_REOPENED_BY_APPEAL',
      targetType: 'PROJECT_FIT_ASSESSMENT',
      targetId: assessmentId,
      after: { appealId },
    });
  }
}
