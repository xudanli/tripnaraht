import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { FILTER_OPTIONS } from '../match-square.constants';
import {
  CreatePostDto,
  ListPostsQueryDto,
  ReviewApplicationDto,
  SubmitApplicationDto,
  UpdatePostStatusDto,
} from '../dto/match-square.dto';
import {
  buildPersonaSnapshot,
  mbtiQuadrant,
} from '../utils/match-square-persona.util';
import {
  mapApplicationCard,
  mapPostCard,
} from '../utils/match-square-card.mapper';
import { RecruitingRuntimeService } from './recruiting-runtime.service';
import { PublishingPermissionService } from '../../identity-governance/services/publishing-permission.service';
import {
  assertMatchSquareLegacyWritesFrozen,
  assertMatchSquareNotFrozen,
  resolveMatchSquareAccess,
} from '../utils/match-square-access.util';

@Injectable()
export class MatchSquareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publishingPermission: PublishingPermissionService,
    @Optional() private readonly recruitingRuntime?: RecruitingRuntimeService,
  ) {}

  async getAccess(userId?: string) {
    const persona = userId ? await this.loadPersona(userId) : null;
    return resolveMatchSquareAccess(
      this.publishingPermission,
      userId,
      persona?.quizComplete ?? false,
    );
  }

  getFilterOptions() {
    return FILTER_OPTIONS;
  }

  async listPosts(query: ListPostsQueryDto, viewerUserId?: string) {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const where: Prisma.MatchSquarePostWhereInput = {
      status: 'active',
    };

    if (query.destination?.trim()) {
      where.OR = [
        { destination: { contains: query.destination.trim(), mode: 'insensitive' } },
        { departureLabel: { contains: query.destination.trim(), mode: 'insensitive' } },
        { itinerarySummary: { contains: query.destination.trim(), mode: 'insensitive' } },
      ];
    }

    if (query.dateFrom) {
      where.endDate = { gte: new Date(query.dateFrom) };
    }
    if (query.dateTo) {
      where.startDate = { ...(where.startDate as object), lte: new Date(query.dateTo) };
    }

    const [rows, total] = await Promise.all([
      this.prisma.matchSquarePost.findMany({
        where,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: offset,
        take: limit,
        include: {
          applications: {
            where: { status: 'approved' },
          },
        },
      }),
      this.prisma.matchSquarePost.count({ where }),
    ]);

    const personaTypes = this.splitCsv(query.personaTypes);
    const personaQuadrants = this.splitCsv(query.personaQuadrants);
    const interactionModes = this.splitCsv(query.interactionModes);
    const planningStyles = this.splitCsv(query.planningStyles);

    const filtered = rows.filter((row) => {
      if (personaTypes.length && !personaTypes.includes(row.captainMbtiType ?? '')) {
        return false;
      }
      if (
        personaQuadrants.length &&
        !personaQuadrants.includes(mbtiQuadrant(row.captainMbtiType ?? ''))
      ) {
        return false;
      }
      if (
        interactionModes.length &&
        !interactionModes.includes(row.captainInteractionMode ?? '')
      ) {
        return false;
      }
      if (planningStyles.length && !planningStyles.includes(row.planningStyle ?? '')) {
        return false;
      }
      return true;
    });

    const items = filtered.map((row) =>
      mapPostCard(row, {
        applications: row.applications,
        viewerUserId,
      }),
    );

    return {
      items,
      total,
      feedItems: items.map((post) => ({ kind: 'post', post })),
      matchFlash: null,
    };
  }

  async getPost(postId: string, viewerUserId?: string) {
    const post = await this.requirePost(postId);
    const applications = await this.prisma.matchSquareApplication.findMany({
      where: { postId },
    });
    return mapPostCard(post, { applications, viewerUserId });
  }

  async listMyPosts(userId: string) {
    const rows = await this.prisma.matchSquarePost.findMany({
      where: { captainUserId: userId },
      orderBy: [{ updatedAt: 'desc' }],
      include: {
        applications: true,
      },
    });

    const items = rows.map((row) =>
      mapPostCard(row, {
        applications: row.applications,
        viewerUserId: userId,
      }),
    );

    return { items, total: items.length };
  }

  async createPost(userId: string, dto: CreatePostDto) {
    assertMatchSquareLegacyWritesFrozen();
    const access = await this.getAccess(userId);
    assertMatchSquareNotFrozen(access);
    await this.assertQuizComplete(userId);
    const persona = await this.loadPersona(userId);

    const post = await this.prisma.matchSquarePost.create({
      data: {
        captainUserId: userId,
        status: 'active',
        destination: dto.destination.trim(),
        departureLabel: dto.departureLabel?.trim() || null,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        itinerarySummary: dto.itinerarySummary?.trim() || dto.captainMessage.trim(),
        captainMessage: dto.captainMessage.trim(),
        recruitmentVision: dto.vibeFreeText?.trim() || null,
        budgetMinCents: dto.budgetMinCents ?? null,
        budgetMaxCents: dto.budgetMaxCents ?? null,
        slotsNeeded: dto.slotsNeeded,
        planningStyle: dto.planningStyle,
        tripMoodTag: dto.tripMoodTag ?? null,
        travelMode: dto.travelMode ?? null,
        vehicleInfo: dto.vehicleInfo ?? null,
        preferenceNotes: dto.preferences ?? null,
        captainMbtiType: persona.mbtiType,
        captainCardTitle: persona.cardTitle,
        captainInteractionMode: persona.interactionMode,
        destinationLat: dto.coordinates?.lat ?? null,
        destinationLng: dto.coordinates?.lng ?? null,
        vibeSnapshot: dto.vibeParse ? (dto.vibeParse as Prisma.InputJsonValue) : undefined,
        routeDirectionId: dto.routeDirectionId ?? null,
        routeDirectionName: dto.routeDirectionName ?? null,
        publishedAt: new Date(),
      },
    });

    return mapPostCard(post, { viewerUserId: userId });
  }

  async updatePostStatus(userId: string, postId: string, dto: UpdatePostStatusDto) {
    assertMatchSquareLegacyWritesFrozen();
    const post = await this.requireCaptainPost(userId, postId);
    const updated = await this.prisma.matchSquarePost.update({
      where: { id: post.id },
      data: {
        status: dto.status,
        closedAt: dto.status === 'closed' ? new Date() : post.closedAt,
        publishedAt: dto.status === 'active' ? post.publishedAt ?? new Date() : post.publishedAt,
      },
    });
    return mapPostCard(updated, { viewerUserId: userId });
  }

  async listMyApplications(userId: string) {
    const rows = await this.prisma.matchSquareApplication.findMany({
      where: { applicantUserId: userId },
      orderBy: [{ createdAt: 'desc' }],
      include: { post: true },
    });
    return rows.map((row) => mapApplicationCard(row, row.post));
  }

  async listPostApplications(
    userId: string,
    postId: string,
    status?: 'pending',
  ) {
    await this.requireCaptainPost(userId, postId);
    const rows = await this.prisma.matchSquareApplication.findMany({
      where: {
        postId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      include: { post: true },
    });
    return rows.map((row) => mapApplicationCard(row, row.post));
  }

  async getApplyPreview(postId: string, viewerUserId?: string) {
    const post = await this.requirePost(postId);
    if (!viewerUserId) {
      return {
        canApply: false,
        blockReason: '请先登录后再申请',
      };
    }

    const persona = await this.loadPersona(viewerUserId);
    if (!persona.quizComplete) {
      return {
        canApply: false,
        blockReason: '请先完成 Odyssey 测评后再申请',
      };
    }

    if (post.captainUserId === viewerUserId) {
      return {
        canApply: false,
        blockReason: '不能申请自己发布的招募',
      };
    }

    const existing = await this.prisma.matchSquareApplication.findUnique({
      where: {
        postId_applicantUserId: {
          postId,
          applicantUserId: viewerUserId,
        },
      },
    });

    if (existing && existing.status !== 'withdrawn' && existing.status !== 'rejected') {
      return {
        canApply: false,
        existingApplicationStatus: existing.status,
        blockReason: '你已提交过申请',
      };
    }

    const compatibilityPercent =
      mapPostCard(post, { viewerUserId }).compatibilityPercent ?? 75;

    return {
      canApply: true,
      compatibilityPercent,
      highlights: ['基础人格维度匹配通过'],
      warnings: [],
      physicalFitnessGate: { blocked: false },
      conflictPrompt: null,
      teamworkCommitmentPrompt: null,
      teamworkMatchBlocked: false,
    };
  }

  async submitApplication(
    userId: string,
    postId: string,
    dto: SubmitApplicationDto,
  ) {
    assertMatchSquareLegacyWritesFrozen();
    const access = await this.getAccess(userId);
    assertMatchSquareNotFrozen(access);
    await this.assertQuizComplete(userId);
    const post = await this.requirePost(postId);
    if (post.captainUserId === userId) {
      throw new BadRequestException('不能申请自己发布的招募');
    }
    if (post.status !== 'active') {
      throw new BadRequestException('该招募当前不可申请');
    }

    const persona = await this.loadPersona(userId);
    const application = await this.prisma.matchSquareApplication.upsert({
      where: {
        postId_applicantUserId: {
          postId,
          applicantUserId: userId,
        },
      },
      create: {
        postId,
        applicantUserId: userId,
        status: 'pending',
        message: dto.message.trim(),
        planningCommitmentAccepted: Boolean(dto.planningCommitmentAccepted),
        teamworkCommitmentAccepted: Boolean(dto.teamworkCommitmentAccepted),
        targetSlotIndex: dto.targetSlotIndex ?? null,
        targetSlotId: dto.targetSlotId ?? null,
        targetSlotLabel: dto.targetSlotLabel ?? null,
        applicantMbtiType: persona.mbtiType,
        applicantCardTitle: persona.cardTitle,
        applicantInteractionMode: persona.interactionMode,
      },
      update: {
        status: 'pending',
        message: dto.message.trim(),
        planningCommitmentAccepted: Boolean(dto.planningCommitmentAccepted),
        teamworkCommitmentAccepted: Boolean(dto.teamworkCommitmentAccepted),
        targetSlotIndex: dto.targetSlotIndex ?? null,
        targetSlotId: dto.targetSlotId ?? null,
        targetSlotLabel: dto.targetSlotLabel ?? null,
        decidedAt: null,
      },
    });

    return mapApplicationCard(application, post);
  }

  async reviewApplication(
    userId: string,
    postId: string,
    applicationId: string,
    dto: ReviewApplicationDto,
  ) {
    assertMatchSquareLegacyWritesFrozen();
    const post = await this.requireCaptainPost(userId, postId);
    const application = await this.prisma.matchSquareApplication.findFirst({
      where: { id: applicationId, postId },
    });
    if (!application) {
      throw new NotFoundException('申请不存在');
    }

    const decision = dto.action === 'approve' ? 'approved' : 'rejected';

    const app = application!;
    const updated = await this.prisma.matchSquareApplication.update({
      where: { id: app.id },
      data: {
        status: decision,
        decidedAt: new Date(),
      },
    });

    // 触发招募归因分析
    if (this.recruitingRuntime) {
      try {
        await this.recruitingRuntime!.reviewApplication(applicationId, decision, {
          captainUserId: userId,
          applicantUserId: app.applicantUserId,
          compatibilityScore: dto.compatibilityScore,
          mbtiCompatibility: dto.mbtiCompatibility,
          requiredSkills: dto.requiredSkills,
          applicantSkills: dto.applicantSkills,
          scheduleConflict: dto.scheduleConflict,
          timeAvailability: dto.timeAvailability,
          budgetFit: dto.budgetFit,
          captainPreference: dto.captainPreference,
          slotRequirement: dto.slotRequirement,
          teamBalance: dto.teamBalance,
          pastCollaboration: dto.pastCollaboration,
          governanceFlags: dto.governanceFlags,
        });
      } catch (attributionError) {
        // 归因失败不应阻塞主流程
        console.error(`[RecruitingRuntime] Attribution failed for application ${applicationId}:`, attributionError);
      }
    }

    const applications = await this.prisma.matchSquareApplication.findMany({
      where: { postId },
    });

    return {
      application: mapApplicationCard(updated, post),
      teamPuzzle: mapPostCard(post, { applications, viewerUserId: userId }).teamPuzzle,
    };
  }

  private async loadPersona(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    return buildPersonaSnapshot({
      displayName: user.displayName,
      preferences: user.profile?.preferences,
    });
  }

  private async assertQuizComplete(userId: string) {
    const persona = await this.loadPersona(userId);
    if (!persona.quizComplete) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: '请先完成 Odyssey 测评',
      });
    }
  }

  private async requirePost(postId: string) {
    const post = await this.prisma.matchSquarePost.findUnique({ where: { id: postId } });
    if (!post) {
      throw new NotFoundException('招募帖不存在');
    }
    return post;
  }

  private async requireCaptainPost(userId: string, postId: string) {
    const post = await this.requirePost(postId);
    if (post.captainUserId !== userId) {
      throw new ForbiddenException('仅队长可执行此操作');
    }
    return post;
  }

  private splitCsv(value?: string): string[] {
    if (!value?.trim()) return [];
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
}
