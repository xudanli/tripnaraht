import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  buildReputationFactsSummary,
  REPUTATION_EVENT_TYPES,
  ReputationEventType,
  ReputationSubjectType,
} from '../constants/reputation-event.constants';
import { IdentityAuditLogService } from './audit-log.service';

export type RecordReputationEventInput = {
  subjectType: ReputationSubjectType;
  subjectId: string;
  eventType: ReputationEventType;
  evidenceSource: string;
  occurredAt?: Date;
  projectId?: string;
  listingId?: string;
  eventResult?: string;
  recordedById?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
};

@Injectable()
export class ReputationEventService {
  private readonly logger = new Logger(ReputationEventService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
  ) {}

  async record(input: RecordReputationEventInput) {
    if (!REPUTATION_EVENT_TYPES.includes(input.eventType)) {
      throw new BadRequestException(`不支持的事件类型: ${input.eventType}`);
    }

    if (input.idempotencyKey) {
      const existing = await this.prisma.reputationEvent.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    const event = await this.prisma.reputationEvent.create({
      data: {
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        eventType: input.eventType,
        evidenceSource: input.evidenceSource,
        occurredAt: input.occurredAt ?? new Date(),
        projectId: input.projectId ?? null,
        listingId: input.listingId ?? null,
        eventResult: input.eventResult ?? null,
        recordedById: input.recordedById ?? null,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });

    await this.auditLog.record({
      actorId: input.recordedById ?? undefined,
      action: 'REPUTATION_EVENT_RECORDED',
      targetType: 'REPUTATION_EVENT',
      targetId: event.id,
      after: {
        subjectType: event.subjectType,
        subjectId: event.subjectId,
        eventType: event.eventType,
      },
    });

    return event;
  }

  async getFactsSummary(subjectType: ReputationSubjectType, subjectId: string) {
    const events = await this.prisma.reputationEvent.findMany({
      where: { subjectType, subjectId },
      select: { eventType: true, occurredAt: true },
      orderBy: { occurredAt: 'desc' },
      take: 500,
    });

    return {
      subjectType,
      subjectId,
      facts: buildReputationFactsSummary(events),
    };
  }

  async listRecentEvents(
    subjectType: ReputationSubjectType,
    subjectId: string,
    limit = 20,
  ) {
    const events = await this.prisma.reputationEvent.findMany({
      where: { subjectType, subjectId },
      orderBy: { occurredAt: 'desc' },
      take: limit,
    });

    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      eventResult: e.eventResult,
      evidenceSource: e.evidenceSource,
      occurredAt: e.occurredAt.toISOString(),
      projectId: e.projectId,
      listingId: e.listingId,
    }));
  }

  async recordTrustedProjectCompletion(
    tripId: string,
    outcome?: { success?: string; overallScore?: number },
  ): Promise<void> {
    const listing = await this.prisma.trustedProjectListing.findFirst({
      where: { tripId },
    });
    if (!listing) {
      return;
    }

    const eventResult = outcome?.success ?? 'COMPLETED';
    const metadata = {
      overallScore: outcome?.overallScore ?? null,
      listingTitle: listing.title,
    };

    await this.record({
      subjectType: 'USER',
      subjectId: listing.responsibleUserId,
      eventType: 'PROJECT_COMPLETED',
      evidenceSource: 'TRIP_OUTCOME',
      projectId: tripId,
      listingId: listing.id,
      eventResult,
      metadata,
      idempotencyKey: `trip-complete:${tripId}:USER:${listing.responsibleUserId}`,
    });

    if (listing.organizationId) {
      await this.record({
        subjectType: 'ORGANIZATION',
        subjectId: listing.organizationId,
        eventType: 'PROJECT_COMPLETED',
        evidenceSource: 'TRIP_OUTCOME',
        projectId: tripId,
        listingId: listing.id,
        eventResult,
        metadata,
        idempotencyKey: `trip-complete:${tripId}:ORGANIZATION:${listing.organizationId}`,
      });
    }

    this.logger.log(`Recorded PROJECT_COMPLETED reputation events for trip ${tripId}`);
  }

  async recordProviderCancellation(
    listing: {
      id: string;
      responsibleUserId: string;
      organizationId: string | null;
      tripId: string | null;
      title: string;
    },
    recordedById: string,
    reason?: string,
  ): Promise<void> {
    const metadata = { listingTitle: listing.title, reason: reason ?? null };

    await this.record({
      subjectType: 'USER',
      subjectId: listing.responsibleUserId,
      eventType: 'PROJECT_CANCELLED_BY_PROVIDER',
      evidenceSource: 'TRUSTED_PROJECT',
      projectId: listing.tripId ?? undefined,
      listingId: listing.id,
      eventResult: 'CLOSED',
      recordedById,
      metadata,
      idempotencyKey: `listing-cancel:${listing.id}:USER:${listing.responsibleUserId}`,
    });

    if (listing.organizationId) {
      await this.record({
        subjectType: 'ORGANIZATION',
        subjectId: listing.organizationId,
        eventType: 'PROJECT_CANCELLED_BY_PROVIDER',
        evidenceSource: 'TRUSTED_PROJECT',
        projectId: listing.tripId ?? undefined,
        listingId: listing.id,
        eventResult: 'CLOSED',
        recordedById,
        metadata,
        idempotencyKey: `listing-cancel:${listing.id}:ORGANIZATION:${listing.organizationId}`,
      });
    }
  }

  async recordMemberWithdrawal(
    listing: { id: string; tripId: string | null; title: string; startDate?: Date },
    applicantUserId: string,
    applicationId: string,
  ): Promise<void> {
    const daysUntilStart = listing.startDate
      ? Math.ceil((listing.startDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : 999;
    const eventType = daysUntilStart <= 7 ? 'MEMBER_WITHDREW_LATE' : 'MEMBER_WITHDREW_NORMAL';

    await this.record({
      subjectType: 'USER',
      subjectId: applicantUserId,
      eventType,
      evidenceSource: 'TRUSTED_PROJECT',
      projectId: listing.tripId ?? undefined,
      listingId: listing.id,
      eventResult: 'WITHDRAWN',
      recordedById: applicantUserId,
      metadata: { listingTitle: listing.title, applicationId, daysUntilStart },
      idempotencyKey: `member-withdraw:${listing.id}:${applicationId}`,
    });
  }
}
