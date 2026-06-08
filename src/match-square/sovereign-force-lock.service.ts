import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { MatchSquareRecruitmentPost, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PreferenceEvolutionService } from '../agent/services/preference-evolution.service';
import { TripInstantiationService } from './trip-instantiation.service';
import { readTrekkingOrchestrationFromSnapshot } from './engine/trekking-vibe-orchestration.engine';
import { parseTrekkingFitnessBaseline } from './util/trekking-fitness-baseline.util';
import {
  attachSovereignForceLockSnapshot,
  buildForceLockPreview,
  buildSovereignForceLockRecord,
  buildTaskRebalanceNote,
  readSovereignForceLockFromSnapshot,
  type ForceLockApplicationRow,
} from './engine/sovereign-force-lock.engine';
import type {
  SovereignForceLockPreviewView,
  SovereignForceLockResultView,
} from './types/sovereign-force-lock.types';
import { assertValidPostId } from './util/post-id.util';

@Injectable()
export class SovereignForceLockService {
  private readonly logger = new Logger(SovereignForceLockService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripInstantiation: TripInstantiationService,
    @Optional() private readonly preferenceEvolution?: PreferenceEvolutionService,
  ) {}

  async previewForceLock(userId: string, postId: string): Promise<SovereignForceLockPreviewView> {
    const ctx = await this.loadContext(userId, postId);
    return buildForceLockPreview(ctx);
  }

  async executeForceLock(
    userId: string,
    postId: string,
    input?: { note?: string; skipInstantiate?: boolean },
  ): Promise<SovereignForceLockResultView> {
    const ctx = await this.loadContext(userId, postId);
    const preview = buildForceLockPreview(ctx);

    if (!preview.canForceLock) {
      throw new BadRequestException(preview.blockReason ?? '当前无法强制成团');
    }

    const now = new Date();
    const pendingIds = ctx.pendingApplications.map((a) => a.id);
    const taskRebalanceNote = await this.buildRebalanceNote(ctx.post, ctx.approvedApplications);

    const record = buildSovereignForceLockRecord({
      post: ctx.post,
      preview,
      lockedByUserId: userId,
      note: input?.note?.trim() ?? null,
      pendingRejected: pendingIds.length,
      taskRebalanceNote,
    });

    const prevSnapshot =
      ctx.post.captainPersonaSnapshot && typeof ctx.post.captainPersonaSnapshot === 'object'
        ? (ctx.post.captainPersonaSnapshot as Record<string, unknown>)
        : {};
    const nextSnapshot = attachSovereignForceLockSnapshot(prevSnapshot, record);

    await this.prisma.$transaction(async (tx) => {
      if (pendingIds.length > 0) {
        await tx.matchSquareRecruitmentApplication.updateMany({
          where: { id: { in: pendingIds }, status: 'pending' },
          data: { status: 'rejected', decidedAt: now },
        });
      }

      await tx.matchSquareRecruitmentPost.update({
        where: { id: postId },
        data: {
          status: 'closed',
          closedAt: now,
          slotsNeeded: ctx.post.slotsFilled,
          captainPersonaSnapshot: nextSnapshot as Prisma.InputJsonValue,
        },
      });
    });

    const dnaScheduled = this.scheduleEfficiencyDnaSync(userId, postId);

    let instantiation = null;
    if (!input?.skipInstantiate) {
      try {
        instantiation = await this.tripInstantiation.instantiateTripFromRecruitmentPost(
          userId,
          postId,
          { skipIfExists: true },
        );
      } catch (error) {
        this.logger.warn(
          `Force lock ok but instantiate failed post=${postId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Sovereign force lock post=${postId} crew=${1 + ctx.post.slotsFilled} dropped=${preview.droppedOpenSlots.length} dna=${dnaScheduled}`,
    );

    return {
      postId,
      sovereignLock: record,
      rejectedApplicationIds: pendingIds,
      instantiation,
      activeTripPath: instantiation?.activeTripPath ?? null,
      dnaScheduled,
    };
  }

  private async loadContext(userId: string, postId: string) {
    assertValidPostId(postId);
    const post = await this.prisma.matchSquareRecruitmentPost.findUnique({ where: { id: postId } });
    if (!post) throw new NotFoundException('招募帖不存在');
    if (post.captainUserId !== userId) {
      throw new ForbiddenException('仅队长可执行强制成团');
    }

    const applications = await this.prisma.matchSquareRecruitmentApplication.findMany({
      where: { postId },
      select: {
        id: true,
        applicantUserId: true,
        status: true,
        applicantDisplayName: true,
        applicantCardTitle: true,
        targetSlotIndex: true,
        targetSlotLabel: true,
      },
    });

    const approvedApplications = applications.filter(
      (a): a is ForceLockApplicationRow => a.status === 'approved',
    );
    const pendingApplications = applications.filter(
      (a): a is ForceLockApplicationRow => a.status === 'pending',
    );

    return { post, approvedApplications, pendingApplications };
  }

  private async buildRebalanceNote(
    post: MatchSquareRecruitmentPost,
    approved: ForceLockApplicationRow[],
  ): Promise<string | null> {
    const orch = readTrekkingOrchestrationFromSnapshot(post.captainPersonaSnapshot);
    const gearLabels = orch?.sharedGearDeficits?.map((g) => g.item) ?? [];
    const preview = buildForceLockPreview({ post, approvedApplications: approved, pendingApplications: [] });

    const fitnessScores = await this.loadFitnessScores([
      post.captainUserId,
      ...approved.map((a) => a.applicantUserId),
    ]);
    let bestUserId = post.captainUserId;
    let bestScore = -1;
    for (const [uid, score] of fitnessScores) {
      if (score > bestScore) {
        bestScore = score;
        bestUserId = uid;
      }
    }

    const assigneeLabel =
      bestUserId === post.captainUserId
        ? '队长'
        : approved.find((a) => a.applicantUserId === bestUserId)?.applicantDisplayName ??
          approved.find((a) => a.applicantUserId === bestUserId)?.applicantCardTitle ??
          '队员';

    return buildTaskRebalanceNote({
      droppedSlotCount: preview.droppedOpenSlots.length,
      assigneeLabel,
      sharedGearLabels: gearLabels,
    });
  }

  private async loadFitnessScores(userIds: string[]): Promise<Map<string, number>> {
    const rows = await this.prisma.userTravelProfile.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, extendedProfile: true },
    });
    const map = new Map<string, number>();
    for (const row of rows) {
      const baseline = parseTrekkingFitnessBaseline(
        row.extendedProfile as Record<string, unknown> | null,
      );
      const score =
        baseline.maxDailyAscentM * 0.4 +
        baseline.maxAltitudeM * 0.002 +
        baseline.maxPackWeightKg * 10;
      map.set(row.userId, score);
    }
    return map;
  }

  private scheduleEfficiencyDnaSync(captainUserId: string, postId: string): boolean {
    if (!this.preferenceEvolution) return false;
    this.preferenceEvolution.scheduleDecisionDnaSync({
      userId: captainUserId,
      tripId: postId,
      reason: 'SOVEREIGN_FORCE_LOCK',
    });
    return true;
  }
}

export { readSovereignForceLockFromSnapshot };
