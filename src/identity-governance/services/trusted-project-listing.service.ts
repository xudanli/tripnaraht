import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  requiredPublishingLevel,
  TrustedProjectCommercialType,
} from '../constants/trusted-project.constants';
import { isPublicPublishingLevel } from '../constants/identity-governance.constants';
import { IdentityAuditLogService } from './audit-log.service';
import { PublishingPermissionService } from './publishing-permission.service';
import { ProfessionalCertificationService } from './professional-certification.service';
import { ReputationEventService } from './reputation-event.service';
import { ProjectMembershipService } from './project-membership.service';

export type CreateTrustedProjectInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  summary: string;
  commercialType: TrustedProjectCommercialType;
  slotsTotal?: number;
  budgetMinCents?: number;
  budgetMaxCents?: number;
  riskDisclosure?: string;
  refundPolicy?: string;
  tripId?: string;
  organizationId?: string;
};

@Injectable()
export class TrustedProjectListingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: IdentityAuditLogService,
    private readonly publishingPermission: PublishingPermissionService,
    private readonly professionalCertification: ProfessionalCertificationService,
    private readonly reputation: ReputationEventService,
    private readonly projectMembership: ProjectMembershipService,
  ) {}

  async createDraft(userId: string, input: CreateTrustedProjectInput) {
    await this.assertCanPublish(userId, input.commercialType, input.organizationId);

    const publisherSubjectType = input.organizationId ? 'ORGANIZATION' : 'USER';
    const publisherSubjectId = input.organizationId ?? userId;

    if (input.organizationId) {
      await this.assertOrgManager(input.organizationId, userId);
    }

    const listing = await this.prisma.trustedProjectListing.create({
      data: {
        publisherSubjectType,
        publisherSubjectId,
        createdByUserId: userId,
        responsibleUserId: userId,
        organizationId: input.organizationId ?? null,
        commercialType: input.commercialType,
        reviewStatus: 'DRAFT',
        listingStatus: 'draft',
        title: input.title.trim(),
        destination: input.destination.trim(),
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        summary: input.summary.trim(),
        slotsTotal: input.slotsTotal ?? 1,
        budgetMinCents: input.budgetMinCents ?? null,
        budgetMaxCents: input.budgetMaxCents ?? null,
        riskDisclosure: input.riskDisclosure?.trim() || null,
        refundPolicy: input.refundPolicy?.trim() || null,
        tripId: input.tripId ?? null,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'TRUSTED_PROJECT_DRAFT_CREATED',
      targetType: 'TRUSTED_PROJECT_LISTING',
      targetId: listing.id,
      after: { commercialType: input.commercialType },
    });

    return listing;
  }

  async submitForReview(userId: string, listingId: string) {
    const listing = await this.requireManagerListing(userId, listingId);
    if (listing.reviewStatus !== 'DRAFT' && listing.reviewStatus !== 'NEED_REVISION') {
      throw new BadRequestException(`当前审核状态 ${listing.reviewStatus} 不可提交`);
    }

    this.assertListingComplete(listing);

    const updated = await this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: {
        reviewStatus: 'UNDER_REVIEW',
        listingStatus: 'pending_review',
        submittedAt: new Date(),
        reviewNotes: null,
      },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'TRUSTED_PROJECT_SUBMITTED',
      targetType: 'TRUSTED_PROJECT_LISTING',
      targetId: listingId,
    });

    return updated;
  }

  async listPublished(query: { destination?: string; limit?: number; offset?: number }) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const where: { listingStatus: string; destination?: { contains: string; mode: 'insensitive' } } = {
      listingStatus: 'published',
    };
    if (query.destination?.trim()) {
      where.destination = { contains: query.destination.trim(), mode: 'insensitive' };
    }

    const [rows, total] = await Promise.all([
      this.prisma.trustedProjectListing.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { startDate: 'asc' }],
        skip: offset,
        take: limit,
      }),
      this.prisma.trustedProjectListing.count({ where }),
    ]);

    const items = await this.enrichListings(rows);
    return { items, total };
  }

  async getPublished(listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({
      where: { id: listingId },
    });
    if (!listing || listing.listingStatus !== 'published') {
      throw new NotFoundException('项目不存在或未发布');
    }
    const [enriched] = await this.enrichListings([listing]);
    return enriched;
  }

  private async getJoinableListing(listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({
      where: { id: listingId },
    });
    if (!listing || !['published', 'suspended'].includes(listing.listingStatus)) {
      throw new NotFoundException('项目不存在或不可操作');
    }
    return listing;
  }

  async linkTrip(userId: string, listingId: string, tripId: string) {
    const listing = await this.requireManagerListing(userId, listingId);
    const trimmedTripId = tripId.trim();
    if (!trimmedTripId) {
      throw new BadRequestException('tripId 不能为空');
    }

    if (listing.tripId && listing.tripId !== trimmedTripId) {
      throw new BadRequestException('该项目已关联其他行程');
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: trimmedTripId } });
    if (!trip) {
      throw new NotFoundException('行程不存在');
    }

    const updated = await this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: { tripId: trimmedTripId },
    });

    await this.auditLog.record({
      actorId: userId,
      action: 'TRUSTED_PROJECT_TRIP_LINKED',
      targetType: 'TRUSTED_PROJECT_LISTING',
      targetId: listingId,
      after: { tripId: trimmedTripId },
    });

    const [enriched] = await this.enrichListings([updated]);
    return enriched;
  }

  async listMine(userId: string) {
    const rows = await this.prisma.trustedProjectListing.findMany({
      where: {
        OR: [
          { createdByUserId: userId },
          { responsibleUserId: userId },
        ],
      },
      orderBy: { updatedAt: 'desc' },
    });
    return this.enrichListings(rows);
  }

  async listForReview(status = 'UNDER_REVIEW', limit = 50) {
    return this.prisma.trustedProjectListing.findMany({
      where: { reviewStatus: status },
      orderBy: { submittedAt: 'asc' },
      take: limit,
    });
  }

  async reviewListing(
    adminId: string,
    listingId: string,
    action: 'approve' | 'reject' | 'need_revision' | 'suspend',
    notes?: string,
  ) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('项目不存在');
    }

    const now = new Date();
    if (action === 'approve') {
      const updated = await this.prisma.trustedProjectListing.update({
        where: { id: listingId },
        data: {
          reviewStatus: 'APPROVED',
          listingStatus: 'published',
          reviewNotes: notes ?? null,
          reviewedById: adminId,
          publishedAt: now,
        },
      });
      await this.auditLog.record({
        actorId: adminId,
        action: 'TRUSTED_PROJECT_APPROVED',
        targetType: 'TRUSTED_PROJECT_LISTING',
        targetId: listingId,
      });
      return updated;
    }

    if (action === 'reject') {
      return this.prisma.trustedProjectListing.update({
        where: { id: listingId },
        data: {
          reviewStatus: 'REJECTED',
          listingStatus: 'draft',
          reviewNotes: notes ?? null,
          reviewedById: adminId,
        },
      });
    }

    if (action === 'need_revision') {
      return this.prisma.trustedProjectListing.update({
        where: { id: listingId },
        data: {
          reviewStatus: 'NEED_REVISION',
          listingStatus: 'draft',
          reviewNotes: notes ?? null,
          reviewedById: adminId,
        },
      });
    }

    return this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: {
        reviewStatus: 'SUSPENDED',
        listingStatus: 'suspended',
        reviewNotes: notes ?? null,
        reviewedById: adminId,
      },
    });
  }

  async submitApplication(userId: string, listingId: string, message?: string) {
    const listing = await this.getPublished(listingId);
    if (listing.responsibleUserId === userId || listing.createdByUserId === userId) {
      throw new BadRequestException('不能申请自己发布的项目');
    }
    if (listing.slotsFilled >= listing.slotsTotal) {
      throw new BadRequestException('项目名额已满');
    }

    const application = await this.prisma.trustedProjectApplication.upsert({
      where: {
        listingId_applicantUserId: { listingId, applicantUserId: userId },
      },
      create: {
        listingId,
        applicantUserId: userId,
        message: message?.trim() || null,
        status: 'pending',
      },
      update: {
        message: message?.trim() || null,
        status: 'pending',
        decidedAt: null,
      },
    });

    return application;
  }

  async reviewApplication(
    managerUserId: string,
    listingId: string,
    applicationId: string,
    action: 'approve' | 'reject',
  ) {
    await this.requireManagerListing(managerUserId, listingId);

    const application = await this.prisma.trustedProjectApplication.findFirst({
      where: { id: applicationId, listingId },
    });
    if (!application) {
      throw new NotFoundException('申请不存在');
    }

    const status = action === 'approve' ? 'APPROVED' : 'REJECTED';
    const updated = await this.prisma.trustedProjectApplication.update({
      where: { id: application.id },
      data: { status, decidedAt: new Date() },
    });

    if (action === 'approve') {
      await this.prisma.trustedProjectListing.update({
        where: { id: listingId },
        data: { slotsFilled: { increment: 1 } },
      });
    }

    return updated;
  }

  async listApplications(managerUserId: string, listingId: string) {
    await this.requireManagerListing(managerUserId, listingId);
    return this.prisma.trustedProjectApplication.findMany({
      where: { listingId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async closeListing(managerUserId: string, listingId: string, reason?: string) {
    const listing = await this.requireManagerListing(managerUserId, listingId);
    if (!['published', 'suspended'].includes(listing.listingStatus)) {
      throw new BadRequestException('仅已发布或已暂停的项目可关闭');
    }
    if (listing.closedAt) {
      throw new BadRequestException('项目已关闭');
    }

    const updated = await this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: {
        listingStatus: 'closed',
        closedAt: new Date(),
        metadata: {
          ...(typeof listing.metadata === 'object' && listing.metadata ? (listing.metadata as object) : {}),
          closeReason: reason?.trim() || null,
          closedByUserId: managerUserId,
        } as Prisma.InputJsonValue,
      },
    });

    await this.reputation.recordProviderCancellation(updated, managerUserId, reason);

    await this.auditLog.record({
      actorId: managerUserId,
      action: 'TRUSTED_PROJECT_CLOSED',
      targetType: 'TRUSTED_PROJECT_LISTING',
      targetId: listingId,
      after: { listingStatus: 'closed' },
    });

    return updated;
  }

  async withdrawMembership(userId: string, listingId: string) {
    const listing = await this.getJoinableListing(listingId);

    const application = await this.prisma.trustedProjectApplication.findUnique({
      where: { listingId_applicantUserId: { listingId, applicantUserId: userId } },
    });
    if (!application) {
      throw new NotFoundException('未找到你的加入申请');
    }
    const allowedStatuses = ['approved', 'APPROVED', 'USER_CONFIRMED', 'JOINED'];
    if (!allowedStatuses.includes(application.status)) {
      throw new BadRequestException('仅已加入或已确认成员可退出项目');
    }

    const updated = await this.prisma.trustedProjectApplication.update({
      where: { id: application.id },
      data: { status: 'WITHDRAWN', decidedAt: new Date() },
    });

    if (listing.tripId && ['JOINED', 'USER_CONFIRMED'].includes(application.status)) {
      await this.projectMembership.leaveFromTrustedApplication(listing.tripId, userId);
    }

    await this.prisma.trustedProjectListing.update({
      where: { id: listingId },
      data: { slotsFilled: { decrement: 1 } },
    });

    await this.reputation.recordMemberWithdrawal(listing, userId, application.id);

    await this.auditLog.record({
      actorId: userId,
      action: 'TRUSTED_PROJECT_MEMBER_WITHDREW',
      targetType: 'TRUSTED_PROJECT_APPLICATION',
      targetId: application.id,
      after: { status: 'withdrawn' },
    });

    return updated;
  }

  private async assertCanPublish(
    userId: string,
    commercialType: TrustedProjectCommercialType,
    organizationId?: string,
  ) {
    const requiredLevel = requiredPublishingLevel(commercialType);
    const subjectType = organizationId ? 'ORGANIZATION' : 'USER';
    const subjectId = organizationId ?? userId;

    const permission = await this.publishingPermission.getSubjectPermission(
      subjectType,
      subjectId,
      userId,
    );

    if (permission.status === 'SUSPENDED') {
      throw new ForbiddenException('发布权限已暂停');
    }

    const levelRank = (level: string) => {
      if (level === 'PUBLIC_COMMERCIAL') return 2;
      if (level === 'PUBLIC_NON_COMMERCIAL') return 1;
      return 0;
    };

    if (levelRank(permission.level) < levelRank(requiredLevel)) {
      throw new ForbiddenException(`发布 ${commercialType} 项目需要 ${requiredLevel} 发布权限`);
    }

    if (commercialType === 'COMMERCIAL' && subjectType === 'USER') {
      const professional = await this.professionalCertification.getStatus(userId);
      if (!professional.isVerifiedProfessional) {
        throw new ForbiddenException('商业项目需 Professional 专业认证通过');
      }
    }

    if (!isPublicPublishingLevel(permission.level)) {
      throw new ForbiddenException('当前账号无公开发布权限');
    }
  }

  private assertListingComplete(listing: {
    title: string;
    summary: string;
    riskDisclosure: string | null;
    commercialType: string;
    refundPolicy: string | null;
  }) {
    if (!listing.title.trim() || !listing.summary.trim()) {
      throw new BadRequestException('标题和项目简介为必填项');
    }
    if (!listing.riskDisclosure?.trim()) {
      throw new BadRequestException('请填写风险披露');
    }
    if (listing.commercialType === 'COMMERCIAL' && !listing.refundPolicy?.trim()) {
      throw new BadRequestException('商业项目需填写退款政策');
    }
  }

  private async requireManagerListing(userId: string, listingId: string) {
    const listing = await this.prisma.trustedProjectListing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('项目不存在');
    }
    if (listing.responsibleUserId !== userId && listing.createdByUserId !== userId) {
      if (listing.organizationId) {
        await this.assertOrgManager(listing.organizationId, userId);
      } else {
        throw new ForbiddenException('无权管理该项目');
      }
    }
    return listing;
  }

  private async assertOrgManager(organizationId: string, userId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    const canManage = membership?.roles.some((r) =>
      ['OWNER', 'AGENCY_ADMIN', 'LEADER'].includes(r.toUpperCase()),
    );
    if (!membership || membership.status !== 'ACTIVE' || !canManage) {
      throw new ForbiddenException('无权代表该机构操作');
    }
  }

  private async enrichListings<
    T extends {
      id: string;
      publisherSubjectType: string;
      publisherSubjectId: string;
      responsibleUserId: string;
      organizationId: string | null;
      slotsTotal: number;
      slotsFilled: number;
    },
  >(listings: T[]) {
    if (listings.length === 0) {
      return [];
    }

    const organizationIds = new Set<string>();
    const userIds = new Set<string>();

    for (const listing of listings) {
      userIds.add(listing.responsibleUserId);
      if (listing.publisherSubjectType === 'ORGANIZATION' || listing.organizationId) {
        organizationIds.add(listing.organizationId ?? listing.publisherSubjectId);
      } else {
        userIds.add(listing.publisherSubjectId);
      }
    }

    const [organizations, users] = await Promise.all([
      organizationIds.size > 0
        ? this.prisma.organization.findMany({
            where: { id: { in: [...organizationIds] } },
            select: { id: true, displayName: true },
          })
        : [],
      userIds.size > 0
        ? this.prisma.user.findMany({
            where: { id: { in: [...userIds] } },
            select: { id: true, displayName: true, email: true },
          })
        : [],
    ]);

    const organizationNameById = new Map<string, string>(
      organizations.map(
        (organization) => [organization.id, organization.displayName] as [string, string],
      ),
    );
    const userNameById = new Map<string, string>(
      users.map(
        (user) =>
          [user.id, user.displayName?.trim() || user.email || '用户'] as [string, string],
      ),
    );

    return listings.map((listing) =>
      this.toPublicListingView(listing, organizationNameById, userNameById),
    );
  }

  private toPublicListingView<
    T extends {
      publisherSubjectType: string;
      publisherSubjectId: string;
      responsibleUserId: string;
      organizationId: string | null;
      slotsTotal: number;
      slotsFilled: number;
    },
  >(
    listing: T,
    organizationNameById: Map<string, string>,
    userNameById: Map<string, string>,
  ) {
    const slotsRemaining = Math.max(0, listing.slotsTotal - listing.slotsFilled);
    const isOrganizationPublisher =
      listing.publisherSubjectType === 'ORGANIZATION' || Boolean(listing.organizationId);
    const organizationId = listing.organizationId ?? listing.publisherSubjectId;

    const publisherSubjectType = isOrganizationPublisher ? 'ORGANIZATION' : 'USER';
    const publisherSubjectId = isOrganizationPublisher
      ? organizationId
      : listing.publisherSubjectId;
    const publisherDisplayName = isOrganizationPublisher
      ? organizationNameById.get(organizationId) ?? '机构'
      : userNameById.get(listing.publisherSubjectId) ??
        userNameById.get(listing.responsibleUserId) ??
        '发布者';

    return {
      ...listing,
      slotsRemaining,
      publisherSubjectType,
      publisherSubjectId,
      publisherDisplayName,
      responsibleUserDisplayName: userNameById.get(listing.responsibleUserId) ?? null,
    };
  }
}
