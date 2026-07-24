import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  GUIDE_PLAN_CANDIDATE_STATUS,
  GUIDE_TO_PLAN_SESSION_STATUS,
  type GuideToPlanSessionStatus,
} from './constants/guide-to-plan-status.constants';
import type {
  GuideParseProgressView,
  GuideToPlanSessionView,
  ImportedGuideView,
} from './types/guide-to-plan.types';
import type { CreateGuideToPlanSessionDto } from './dto/guide-to-plan.dto';
import {
  assertCanImportSession,
  assertCanParseSession,
  assertCanGenerateSession,
  assertDraftReadySession,
  assertMutableSession,
  computeRequiresTravelContext,
  inferResumeRoute,
} from './utils/guide-session.util';

type SessionInclude = {
  importedGuides?: boolean;
  planCandidates?: boolean;
};

type SessionWithIncludes<I extends SessionInclude> = Prisma.GuideToPlanSessionGetPayload<{
  include: I;
}>;

export type ListGuideSessionsOptions = {
  status?: GuideToPlanSessionStatus;
  excludeAbandoned?: boolean;
  limit?: number;
  offset?: number;
};

export type GuideSessionListResult = {
  items: GuideToPlanSessionView[];
  total: number;
  limit: number;
  offset: number;
};

@Injectable()
export class GuideToPlanSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateGuideToPlanSessionDto) {
    const session = await this.prisma.guideToPlanSession.create({
      data: {
        userId,
        countryCode: dto.countryCode ?? null,
        destination: dto.destination ?? null,
        status: GUIDE_TO_PLAN_SESSION_STATUS.COLLECTING,
      },
      include: { importedGuides: true },
    });
    return this.serializeSession(session);
  }

  async getById(userId: string, sessionId: string): Promise<GuideToPlanSessionView> {
    const session = await this.requireSession(userId, sessionId, {
      importedGuides: true,
    });
    const draftCandidateCount = await this.prisma.guidePlanCandidate.count({
      where: { sessionId, status: GUIDE_PLAN_CANDIDATE_STATUS.DRAFT },
    });
    return this.serializeSession(session, { draftCandidateCount });
  }

  async listForUser(userId: string, options: ListGuideSessionsOptions = {}): Promise<GuideSessionListResult> {
    const excludeAbandoned = options.excludeAbandoned !== false;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
    const offset = Math.max(options.offset ?? 0, 0);

    const where = {
      userId,
      ...(options.status ? { status: options.status } : {}),
      ...(excludeAbandoned && !options.status
        ? { status: { not: GUIDE_TO_PLAN_SESSION_STATUS.ABANDONED } }
        : {}),
    };

    const [sessions, total] = await Promise.all([
      this.prisma.guideToPlanSession.findMany({
        where,
        include: { importedGuides: true },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.guideToPlanSession.count({ where }),
    ]);

    const sessionIds = sessions.map((s) => s.id);
    const draftCounts = sessionIds.length
      ? await this.prisma.guidePlanCandidate.groupBy({
          by: ['sessionId'],
          where: {
            sessionId: { in: sessionIds },
            status: GUIDE_PLAN_CANDIDATE_STATUS.DRAFT,
          },
          _count: { _all: true },
        })
      : [];
    const draftCountBySession = new Map(
      draftCounts.map((row) => [row.sessionId, row._count._all]),
    );

    return {
      items: sessions.map((s) =>
        this.serializeSession(s, {
          draftCandidateCount: draftCountBySession.get(s.id) ?? 0,
        }),
      ),
      total,
      limit,
      offset,
    };
  }

  async updateStatus(sessionId: string, status: GuideToPlanSessionStatus) {
    return this.prisma.guideToPlanSession.update({
      where: { id: sessionId },
      data: { status },
    });
  }

  async requireSession<I extends SessionInclude>(
    userId: string,
    sessionId: string,
    include?: I,
  ): Promise<SessionWithIncludes<I>> {
    const session = await this.prisma.guideToPlanSession.findUnique({
      where: { id: sessionId },
      include,
    });
    if (!session) {
      throw new NotFoundException(`Guide-to-Plan session ${sessionId} not found`);
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Not allowed to access this session');
    }
    return session as SessionWithIncludes<I>;
  }

  requireMutable(session: { status: string }, action = '操作'): void {
    assertMutableSession(session.status, action);
  }

  requireCanImport(session: { status: string }, action = '导入攻略'): void {
    assertCanImportSession(session.status, action);
  }

  requireCanParse(session: { status: string }, action = '解析攻略'): void {
    assertCanParseSession(session.status, action);
  }

  requireCanGenerate(session: { status: string }, action = '生成草案'): void {
    assertCanGenerateSession(session.status, action);
  }

  requireDraftReady(session: { status: string }, action = '接受草案'): void {
    assertDraftReadySession(session.status, action);
  }

  serializeSession(
    session: {
      id: string;
      status: string;
      countryCode: string | null;
      destination: string | null;
      travelContext: unknown;
      understandingSummary: unknown;
      themeNarrative: string | null;
      tripId: string | null;
      parseProgress?: unknown;
      createdAt: Date;
      updatedAt: Date;
      importedGuides?: Array<{
        id: string;
        title: string | null;
        sourceType: string;
        sourceUrl: string | null;
        sourcePlatform: string | null;
        parseStatus: string;
        sourceConfidence: number;
        credibilityLevel: string;
        importedAt: Date;
        parsedAt: Date | null;
        parseError: string | null;
      }>;
    },
    extras?: { draftCandidateCount?: number },
  ): GuideToPlanSessionView {
    const travelContext = session.travelContext as GuideToPlanSessionView['travelContext'];
    const parseProgressRaw = session.parseProgress as GuideParseProgressView | null | undefined;
    const parseProgress = parseProgressRaw
      ? {
          status: parseProgressRaw.status,
          progress: parseProgressRaw.progress,
          error: parseProgressRaw.error,
          currentStepLabel: parseProgressRaw.currentStepLabel,
        }
      : null;
    const requiresTravelContext = computeRequiresTravelContext(travelContext, session);
    const draftCandidateCount = extras?.draftCandidateCount ?? 0;

    return {
      id: session.id,
      status: session.status as GuideToPlanSessionStatus,
      countryCode: session.countryCode,
      destination: session.destination,
      travelContext,
      understandingSummary:
        session.understandingSummary as GuideToPlanSessionView['understandingSummary'],
      themeNarrative: session.themeNarrative,
      tripId: session.tripId,
      importedGuides: (session.importedGuides ?? []).map((g) => this.serializeGuide(g)),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      parseProgress,
      requiresTravelContext,
      draftCandidateCount,
      resumeRoute: inferResumeRoute({
        status: session.status,
        parseJobStatus: parseProgressRaw?.status,
        requiresTravelContext,
        hasGuides: (session.importedGuides?.length ?? 0) > 0,
        draftCandidateCount,
        tripId: session.tripId,
      }),
    };
  }

  serializeGuide(guide: {
    id: string;
    title: string | null;
    sourceType: string;
    sourceUrl: string | null;
    sourcePlatform: string | null;
    sourceMetadata?: unknown;
    parseStatus: string;
    sourceConfidence: number;
    credibilityLevel: string;
    importedAt: Date;
    parsedAt: Date | null;
    parseError: string | null;
  }): ImportedGuideView {
    return {
      id: guide.id,
      title: guide.title,
      sourceType: guide.sourceType as ImportedGuideView['sourceType'],
      sourceUrl: guide.sourceUrl,
      sourcePlatform: guide.sourcePlatform,
      sourceMetadata: guide.sourceMetadata as ImportedGuideView['sourceMetadata'],
      parseStatus: guide.parseStatus as ImportedGuideView['parseStatus'],
      sourceConfidence: guide.sourceConfidence,
      credibilityLevel: guide.credibilityLevel as ImportedGuideView['credibilityLevel'],
      importedAt: guide.importedAt.toISOString(),
      parsedAt: guide.parsedAt?.toISOString() ?? null,
      parseError: guide.parseError,
    };
  }
}