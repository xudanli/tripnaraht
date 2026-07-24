import {
  ConflictException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GUIDE_PARSE_JOB_STATUS,
  GUIDE_PARSE_PIPELINE_STEP,
  GUIDE_PARSE_STEP_LABELS,
  GUIDE_PARSE_STEP_PROGRESS,
  GUIDE_TO_PLAN_SESSION_STATUS,
  type GuideParsePipelineStep,
} from '../constants/guide-to-plan-status.constants';
import { GuideToPlanSessionService } from '../guide-to-plan-session.service';
import { GuideToPlanOrchestrator } from './guide-to-plan.orchestrator';
import type { GuideParseProgressView } from '../types/guide-to-plan.types';
import { RedisService } from '../../redis/redis.service';
import { GuideParseProgressHub } from './guide-parse-progress-hub.service';

const PARSE_LOCK_TTL_SEC = 600;
const parseLockKey = (sessionId: string) => `guide-to-plan:parse-lock:${sessionId}`;

@Injectable()
export class GuideParseJobService {
  private readonly logger = new Logger(GuideParseJobService.name);
  private readonly localLocks = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: GuideToPlanSessionService,
    private readonly orchestrator: GuideToPlanOrchestrator,
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly progressHub?: GuideParseProgressHub,
  ) {}

  async startAsyncParse(userId: string, sessionId: string): Promise<{ jobId: string }> {
    const session = await this.sessionService.requireSession(userId, sessionId, {
      importedGuides: true,
    });
    this.sessionService.requireCanParse(session, '解析攻略');

    const guideCount = session.importedGuides?.length ?? 0;
    if (guideCount === 0) {
      throw new BadRequestException('请先导入至少一篇攻略');
    }

    if (await this.isLocked(sessionId)) {
      throw new ConflictException('该会话已有解析任务进行中');
    }

    await this.acquireLock(sessionId);

    const startedAt = new Date().toISOString();
    const initial: GuideParseProgressView = {
      jobId: sessionId,
      status: GUIDE_PARSE_JOB_STATUS.QUEUED,
      currentStep: GUIDE_PARSE_PIPELINE_STEP.CONTENT_ANALYSIS,
      currentStepLabel: GUIDE_PARSE_STEP_LABELS.content_analysis,
      progress: 0,
      estimatedSecondsRemaining: 45,
      startedAt,
      counts: { places: 0, restaurants: 0, hotels: 0, tips: 0, risks: 0 },
      recognizedTags: [],
    };

    await this.persistProgress(sessionId, initial);
    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status: GUIDE_TO_PLAN_SESSION_STATUS.PARSING },
    });

    setImmediate(() => {
      void this.runJob(userId, sessionId, startedAt).finally(() => {
        void this.releaseLock(sessionId);
      });
    });

    return { jobId: sessionId };
  }

  async getParseStatus(userId: string, sessionId: string): Promise<GuideParseProgressView> {
    await this.sessionService.requireSession(userId, sessionId);
    const session = await this.prisma.guideToPlanSession.findUnique({
      where: { id: sessionId },
      select: { parseProgress: true, status: true },
    });
    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    const stored = session.parseProgress as unknown as GuideParseProgressView | null;
    if (stored) return stored;

    return {
      jobId: sessionId,
      status: GUIDE_PARSE_JOB_STATUS.IDLE,
      progress: 0,
      counts: { places: 0, restaurants: 0, hotels: 0, tips: 0, risks: 0 },
      recognizedTags: [],
    };
  }

  private async runJob(userId: string, sessionId: string, startedAt: string) {
    try {
      await this.patchProgress(sessionId, {
        status: GUIDE_PARSE_JOB_STATUS.RUNNING,
      });

      await this.orchestrator.runParsePipelineWithProgress(
        userId,
        sessionId,
        async (update) => {
          await this.patchProgress(sessionId, update);
        },
      );

      await this.patchProgress(sessionId, {
        status: GUIDE_PARSE_JOB_STATUS.COMPLETED,
        currentStep: GUIDE_PARSE_PIPELINE_STEP.DRAFT_GENERATION,
        currentStepLabel: GUIDE_PARSE_STEP_LABELS.draft_generation,
        progress: 1,
        estimatedSecondsRemaining: 0,
        completedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Parse job failed for ${sessionId}: ${message}`);
      await this.patchProgress(sessionId, {
        status: GUIDE_PARSE_JOB_STATUS.FAILED,
        error: message,
        completedAt: new Date().toISOString(),
      });
      await this.prisma.guideToPlanSession.update({
        where: { id: sessionId },
        data: { status: GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING },
      });
    }
  }

  private async patchProgress(
    sessionId: string,
    partial: Partial<GuideParseProgressView>,
  ) {
    const session = await this.prisma.guideToPlanSession.findUnique({
      where: { id: sessionId },
      select: { parseProgress: true },
    });
    const base = (session?.parseProgress as unknown as GuideParseProgressView | null) ?? {
      jobId: sessionId,
      status: GUIDE_PARSE_JOB_STATUS.RUNNING,
      progress: 0,
      counts: { places: 0, restaurants: 0, hotels: 0, tips: 0, risks: 0 },
      recognizedTags: [],
    };

    const merged: GuideParseProgressView = {
      ...base,
      ...partial,
      counts: { ...base.counts, ...(partial.counts ?? {}) },
      recognizedTags: partial.recognizedTags ?? base.recognizedTags,
    };

    if (partial.currentStep && partial.progress === undefined) {
      merged.progress =
        GUIDE_PARSE_STEP_PROGRESS[partial.currentStep as GuideParsePipelineStep] ?? merged.progress;
      merged.currentStepLabel =
        GUIDE_PARSE_STEP_LABELS[partial.currentStep as GuideParsePipelineStep] ??
        partial.currentStep;
      merged.estimatedSecondsRemaining = Math.max(
        2,
        Math.round((1 - merged.progress) * 50),
      );
    }

    await this.persistProgress(sessionId, merged);
  }

  private async persistProgress(sessionId: string, progress: GuideParseProgressView) {
    await this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { parseProgress: progress as object },
    });
    this.progressHub?.publish(sessionId, progress);
  }

  private async isLocked(sessionId: string): Promise<boolean> {
    if (this.localLocks.has(sessionId)) return true;
    if (this.redis) {
      return this.redis.exists(parseLockKey(sessionId));
    }
    return false;
  }

  private async acquireLock(sessionId: string) {
    this.localLocks.add(sessionId);
    if (this.redis) {
      await this.redis.set(parseLockKey(sessionId), '1', PARSE_LOCK_TTL_SEC);
    }
  }

  private async releaseLock(sessionId: string) {
    this.localLocks.delete(sessionId);
    if (this.redis) {
      await this.redis.del(parseLockKey(sessionId));
    }
  }
}
