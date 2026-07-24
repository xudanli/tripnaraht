import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_SOFT_MATCH_WEIGHTS,
  type SoftMatchWeights,
  type WeightIterationSample,
  type PersonaTraits,
} from './types/match-learning.types';
import {
  iterateSoftWeightsFromSamples,
  parseSoftWeights,
} from './engine/soft-weight-iteration.engine';
import {
  getActiveSoftMatchWeights,
  setActiveSoftMatchWeights,
} from './matching-weights.store';
import type { CaptainPersonaSnapshot } from '../match-square/types/match-square.types';
import type { OdysseyIntakeProfile } from '../odyssey-intake/types/odyssey-intake.types';

const CONFIG_ID = 'default';

function toInputJson<T>(value: T): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

@Injectable()
export class MatchLearningService implements OnModuleInit {
  private readonly logger = new Logger(MatchLearningService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.loadWeightsFromDatabase();
    } catch (error: unknown) {
      if (this.isMissingTableError(error)) {
        this.logger.warn(
          '[MatchLearning] matching_soft_weight_configs 未就绪，使用内存默认权重；请执行 prisma migrate deploy',
        );
        setActiveSoftMatchWeights({ ...DEFAULT_SOFT_MATCH_WEIGHTS });
        return;
      }
      throw error;
    }
  }

  getActiveWeights(): SoftMatchWeights {
    return getActiveSoftMatchWeights();
  }

  async loadWeightsFromDatabase(): Promise<SoftMatchWeights> {
    const row = await this.prisma.matchingSoftWeightConfig.findUnique({
      where: { id: CONFIG_ID },
    });

    if (!row) {
      await this.seedDefaultConfig();
      return setActiveSoftMatchWeights({ ...DEFAULT_SOFT_MATCH_WEIGHTS });
    }

    const weights = parseSoftWeights(row.weights);
    setActiveSoftMatchWeights(weights);
    this.logger.log(`[MatchLearning] loaded weights v${row.version} ${JSON.stringify(weights)}`);
    return weights;
  }

  async getWeightsWithMeta() {
    const row = await this.prisma.matchingSoftWeightConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    const weights = getActiveSoftMatchWeights();
    return {
      weights,
      version: row?.version ?? 1,
      lastRunAt: row?.lastRunAt?.toISOString() ?? null,
      updatedAt: row?.updatedAt.toISOString() ?? null,
    };
  }

  async listRecentRuns(limit = 10) {
    const rows = await this.prisma.matchingSoftWeightRun.findMany({
      where: { configId: CONFIG_ID },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      weekStart: r.weekStart.toISOString(),
      weekEnd: r.weekEnd.toISOString(),
      positiveSamples: r.positiveSamples,
      negativeSamples: r.negativeSamples,
      weightBefore: r.weightBefore,
      weightAfter: r.weightAfter,
      adjustments: r.adjustments,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** PRD 5.3 — 每周从 Reputation 互评样本微调 Soft Weights */
  async runWeeklyWeightIteration(now = new Date()): Promise<{
    applied: boolean;
    result: ReturnType<typeof iterateSoftWeightsFromSamples>;
  }> {
    const weekEnd = now;
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const submissions = await this.prisma.reputationSurveySubmission.findMany({
      where: {
        submittedAt: { gte: weekStart, lte: weekEnd },
      },
      include: {
        campaign: {
          include: {
            post: {
              include: {
                applications: { where: { status: 'approved' } },
              },
            },
          },
        },
      },
    });

    const samples: WeightIterationSample[] = [];

    for (const sub of submissions) {
      const post = sub.campaign.post;
      const reviewerPersona = await this.resolvePersonaTraits(
        sub.reviewerUserId,
        post.captainUserId,
        post.captainPersonaSnapshot,
        post.applications,
      );
      const revieweePersona = await this.resolvePersonaTraits(
        sub.revieweeUserId,
        post.captainUserId,
        post.captainPersonaSnapshot,
        post.applications,
      );

      if (!reviewerPersona || !revieweePersona) continue;

      samples.push({
        q1Overall: sub.q1Overall,
        q2PaceSync: sub.q2PaceSync,
        q3Communication: sub.q3Communication,
        q4Spending: sub.q4Spending,
        q5WouldAgain: sub.q5WouldAgain,
        reviewerPersona,
        revieweePersona,
      });
    }

    const current = getActiveSoftMatchWeights();
    const result = iterateSoftWeightsFromSamples(current, samples);

    if (result.skippedReason) {
      this.logger.log(`[MatchLearning] weekly skipped: ${result.skippedReason}`);
      return { applied: false, result };
    }

    const row = await this.prisma.matchingSoftWeightConfig.findUnique({
      where: { id: CONFIG_ID },
    });
    const nextVersion = (row?.version ?? 1) + 1;

    await this.prisma.$transaction([
      this.prisma.matchingSoftWeightRun.create({
        data: {
          configId: CONFIG_ID,
          weekStart,
          weekEnd,
          positiveSamples: result.positiveSamples,
          negativeSamples: result.negativeSamples,
          weightBefore: toInputJson(result.weightBefore),
          weightAfter: toInputJson(result.weightAfter),
          adjustments: toInputJson(result.adjustments),
        },
      }),
      this.prisma.matchingSoftWeightConfig.upsert({
        where: { id: CONFIG_ID },
        create: {
          id: CONFIG_ID,
          weights: toInputJson(result.weightAfter),
          version: 1,
          lastRunAt: now,
        },
        update: {
          weights: toInputJson(result.weightAfter),
          version: nextVersion,
          lastRunAt: now,
        },
      }),
    ]);

    setActiveSoftMatchWeights(result.weightAfter);
    this.logger.log(
      `[MatchLearning] weekly applied +${result.positiveSamples}/-${result.negativeSamples} ` +
        `${JSON.stringify(result.weightBefore)} → ${JSON.stringify(result.weightAfter)}`,
    );

    return { applied: true, result };
  }

  private async seedDefaultConfig(): Promise<void> {
    try {
      await this.prisma.matchingSoftWeightConfig.create({
        data: {
          id: CONFIG_ID,
          weights: toInputJson(DEFAULT_SOFT_MATCH_WEIGHTS),
          version: 1,
        },
      });
    } catch (error: unknown) {
      if (this.isMissingTableError(error)) {
        this.logger.warn('[MatchLearning] 无法 seed 默认权重配置（表不存在）');
        return;
      }
      throw error;
    }
  }

  private isMissingTableError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2021'
    );
  }

  private async resolvePersonaTraits(
    userId: string,
    captainUserId: string,
    captainSnapshotRaw: unknown,
    applications: Array<{ applicantUserId: string; applicantPersonaSnapshot: unknown }>,
  ): Promise<PersonaTraits | null> {
    if (userId === captainUserId) {
      return this.snapshotToTraits(captainSnapshotRaw);
    }

    const app = applications.find((a) => a.applicantUserId === userId);
    if (app) {
      const traits = this.snapshotToTraits(app.applicantPersonaSnapshot);
      if (traits) return traits;
    }

    return this.loadProfileTraits(userId);
  }

  private snapshotToTraits(raw: unknown): PersonaTraits | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as CaptainPersonaSnapshot;
    if (!s.dimensionPercents || !s.rawScores) return null;
    return {
      mbtiType: s.mbtiType,
      dimensionPercents: s.dimensionPercents,
      rawScores: {
        financial_flexibility: s.rawScores.financial_flexibility,
        energy_capacity: s.rawScores.energy_capacity,
        ambiguity_tolerance: s.rawScores.ambiguity_tolerance,
      },
    };
  }

  private async loadProfileTraits(userId: string): Promise<PersonaTraits | null> {
    const row = await this.prisma.userTravelProfile.findUnique({
      where: { userId },
      select: { extendedProfile: true },
    });
    const intake = (row?.extendedProfile as Record<string, unknown> | null)?.odyssey_intake as
      | OdysseyIntakeProfile
      | undefined;
    if (!intake?.dimensionPercents || !intake.rawScores) return null;

    return {
      mbtiType: intake.mbtiType,
      dimensionPercents: intake.dimensionPercents,
      rawScores: {
        financial_flexibility: intake.rawScores.financial_flexibility,
        energy_capacity: intake.rawScores.energy_capacity,
        ambiguity_tolerance: intake.rawScores.ambiguity_tolerance,
      },
    };
  }
}
