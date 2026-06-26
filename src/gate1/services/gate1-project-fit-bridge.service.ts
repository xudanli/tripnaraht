import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Gate1AnalyticsService } from './gate1-support.services';
import { Gate1ParticipantNotificationService } from './gate1-participant-notification.service';
import { generateInviteToken } from './gate1-project.service';
import {
  buildPortalPath,
  mapFitEnrollmentParticipantStatus,
  PortalEnrollmentResult,
  resolveGate1ProjectQuery,
  shouldEnrollPortalStatus,
  summarizeEnrollmentForApplication,
} from '../utils/gate1-project-fit-bridge.util';
import { asInputJson } from '../utils/prisma-json.util';

@Injectable()
export class Gate1ProjectFitBridgeService {
  private readonly logger = new Logger(Gate1ProjectFitBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: Gate1AnalyticsService,
    private readonly notifications: Gate1ParticipantNotificationService,
  ) {}

  async enrollFromTrustedApplication(applicationId: string): Promise<PortalEnrollmentResult> {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: {
        listing: true,
        fitAssessment: { select: { id: true, overallResult: true } },
      },
    });
    if (!application) {
      return { enrolled: false, reason: 'APPLICATION_NOT_FOUND' };
    }

    if (!shouldEnrollPortalStatus(application.status)) {
      return { enrolled: false, reason: 'STATUS_NOT_ELIGIBLE' };
    }

    if (application.gate1ParticipantId) {
      const existing = await this.prisma.gate1Participant.findUnique({
        where: { id: application.gate1ParticipantId },
      });
      if (existing) {
        return {
          enrolled: true,
          alreadyEnrolled: true,
          participantId: existing.id,
          inviteToken: existing.inviteToken,
          portalPath: buildPortalPath(existing.inviteToken),
          gate1ProjectId: existing.projectId,
        };
      }
    }

    const project = await this.findGate1Project(application.listing);
    if (!project) {
      return { enrolled: false, reason: 'NO_GATE1_PROJECT' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: application.applicantUserId },
      select: { id: true, email: true, displayName: true },
    });

    const byUser = await this.prisma.gate1Participant.findFirst({
      where: { projectId: project.id, userId: application.applicantUserId },
    });
    if (byUser) {
      await this.linkApplicationToParticipant(application.id, byUser.id);
      return {
        enrolled: true,
        alreadyEnrolled: true,
        participantId: byUser.id,
        inviteToken: byUser.inviteToken,
        portalPath: buildPortalPath(byUser.inviteToken),
        gate1ProjectId: project.id,
      };
    }

    const token = generateInviteToken();
    const participant = await this.prisma.gate1Participant.create({
      data: {
        projectId: project.id,
        userId: application.applicantUserId,
        role: 'PARTICIPANT',
        displayName: user?.displayName ?? `申请人 ${application.applicantUserId.slice(0, 8)}`,
        contactHint: user?.email ?? null,
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + 90 * 86400000),
        status: mapFitEnrollmentParticipantStatus(application.status),
        acceptedAt: new Date(),
        trustedApplicationId: application.id,
        metadata: asInputJson({
          source: 'TRUSTED_PROJECT_FIT',
          listingId: application.listingId,
          fitAssessmentId: application.fitAssessmentId,
          fitOverallResult: application.fitAssessment?.overallResult,
        }),
      },
    });

    await this.linkApplicationToParticipant(application.id, participant.id);

    await this.analytics.track(project.id, project.cohort, 'project_fit_participant_enrolled', {
      participantId: participant.id,
      properties: {
        applicationId,
        listingId: application.listingId,
        applicantUserId: application.applicantUserId,
      },
    });

    const portalPath = buildPortalPath(token);
    await this.notifications.queueAndSend({
      eventType: 'project_fit_portal_welcome',
      dedupeKey: `fit-enroll:${application.id}`,
      title: `欢迎加入「${application.listing.title}」成员协作`,
      body: `您已通过项目适合度审核并加入成员端。请打开成员门户完成知情同意与偏好填写：${portalPath}`,
      projectId: project.id,
      participantId: participant.id,
      userId: application.applicantUserId,
    });

    return {
      enrolled: true,
      participantId: participant.id,
      inviteToken: token,
      portalPath,
      gate1ProjectId: project.id,
    };
  }

  async getPortalSummaryForApplication(applicationId: string) {
    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { id: applicationId },
      include: { listing: true },
    });
    if (!application) return { portalEnrolled: false };

    const participant = application.gate1ParticipantId
      ? await this.prisma.gate1Participant.findUnique({
          where: { id: application.gate1ParticipantId },
        })
      : await this.prisma.gate1Participant.findFirst({
          where: { trustedApplicationId: application.id },
        });

    const project = participant
      ? await this.prisma.gate1Project.findUnique({
          where: { id: participant.projectId },
          select: { id: true, title: true },
        })
      : await this.findGate1Project(application.listing);

    return summarizeEnrollmentForApplication(
      participant,
      project ? { id: project.id, title: project.title } : null,
    );
  }

  async linkListingToGate1Project(listingId: string, gate1ProjectId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) throw new Error('Listing not found');
    const project = await this.prisma.gate1Project.findUnique({ where: { id: gate1ProjectId } });
    if (!project) throw new Error('Gate1 project not found');

    await this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: { gate1ProjectId },
    });

    if (listing.tripId && !project.linkedTripId) {
      await this.prisma.gate1Project.update({
        where: { id: gate1ProjectId },
        data: { linkedTripId: listing.tripId },
      });
    }

    return { listingId, gate1ProjectId, linkedTripId: listing.tripId ?? project.linkedTripId };
  }

  private async findGate1Project(
    listing: { id: string; tripId: string | null; gate1ProjectId: string | null; title: string },
  ) {
    const query = resolveGate1ProjectQuery(listing);
    if (!query) return null;

    if (query.byId) {
      return this.prisma.gate1Project.findUnique({ where: { id: query.byId } });
    }
    if (query.byLinkedTripId) {
      return this.prisma.gate1Project.findFirst({
        where: { linkedTripId: query.byLinkedTripId },
      });
    }
    return null;
  }

  private async linkApplicationToParticipant(applicationId: string, participantId: string) {
    await this.prisma.trustedProjectApplication.update({
      where: { id: applicationId },
      data: { gate1ParticipantId: participantId },
    });
    await this.prisma.gate1Participant.update({
      where: { id: participantId },
      data: { trustedApplicationId: applicationId },
    });
  }

  async notifyApplicationApproved(applicationId: string, userId: string, listingTitle: string) {
    await this.notifications.queueAndSend({
      eventType: 'project_fit_application_approved',
      dedupeKey: `fit-approved:${applicationId}`,
      title: `「${listingTitle}」申请已通过`,
      body: '领队已批准您的加入申请。请登录 TripNARA 确认条款并完成加入，随后进入成员门户填写协作信息。',
      userId,
    });
  }
}
