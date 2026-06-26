import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { TripStatus, normalizeTripStatus } from '../../dto/trip-status.dto';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { MoneyDnaService } from '../../budget-os/services/money-dna.service';
import type { PostTripSummary } from '../types/experience-loop.types';
import { mergeTripMetadata, parseTripMetadata } from '../utils/trip-metadata.util';
import { buildExperienceFulfillmentReview } from '../../experience-fulfillment/utils/experience-outcome.util';
import { AnchorHandoffService } from './anchor-handoff.service';

@Injectable()
export class PostTripSummaryService {
  private readonly logger = new Logger(PostTripSummaryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly moneyDna: MoneyDnaService,
  ) {}

  async getSummary(tripId: string, userId: string): Promise<PostTripSummary> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new BadRequestException(`行程 ${tripId} 不存在`);

    const status = normalizeTripStatus(trip.status);
    if (status !== TripStatus.COMPLETED) {
      throw new BadRequestException('行后总结仅在该行程 COMPLETED 后可用');
    }

    const meta = parseTripMetadata(trip.metadata);
    if (meta.postTripSummary) {
      return meta.postTripSummary;
    }

    return this.generateAndCache(tripId);
  }

  async onTripCompleted(tripId: string): Promise<void> {
    try {
      await this.generateAndCache(tripId);
      await this.moneyDna.recomputeForTrip(tripId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[PostTripSummary] trip ${tripId}: ${msg}`);
    }
  }

  private async generateAndCache(tripId: string): Promise<PostTripSummary> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new BadRequestException(`行程 ${tripId} 不存在`);

    const meta = parseTripMetadata(trip.metadata);
    if (meta.postTripSummary) return meta.postTripSummary;

    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const summary = await this.buildSummary(tripId, anchor);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue(
          mergeTripMetadata(trip.metadata, { postTripSummary: summary }),
        ),
      },
    });

    return summary;
  }

  private async buildSummary(
    tripId: string,
    anchor: Awaited<ReturnType<AnchorHandoffService['getSnapshot']>>,
  ): Promise<PostTripSummary> {
    const pulses = await this.prisma.tripExperiencePulse.findMany({
      where: { tripId },
      orderBy: { emotionalValueScore: 'desc' },
    });

    const experienceHighlights = pulses
      .filter((p) => (p.emotionalValueScore ?? 0) >= 4)
      .slice(0, 5)
      .map((p) => ({
        activityName: p.activityName ?? '行程体验',
        emotionalValueScore: p.emotionalValueScore ?? 0,
        memberId: p.memberId,
        quote: p.freeText ?? undefined,
      }));

    const txs = await this.prisma.tripSmartTransaction.findMany({ where: { tripId } });
    const totalSpentCny = Math.round(txs.reduce((s, t) => s + t.amountCny, 0) * 100) / 100;
    const budgetTotal = anchor?.budget.intent.total ?? null;
    const usagePercent =
      budgetTotal && budgetTotal > 0
        ? Math.round((totalSpentCny / budgetTotal) * 100)
        : null;

    const byBucket = new Map<string, number>();
    for (const t of txs) {
      byBucket.set(t.bucketAssignment, (byBucket.get(t.bucketAssignment) ?? 0) + t.amountCny);
    }
    const topCategory =
      [...byBucket.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const thermoRows = await this.prisma.tripTeamThermometerSnapshot.findMany({
      where: { tripId },
      orderBy: { dayNumber: 'asc' },
    });

    const memberIds = anchor?.team.members.map((m) => m.userId) ?? [];
    const profileCalibrations = [];
    for (const uid of memberIds) {
      try {
        const profile = await this.moneyDna.getProfile(uid);
        profileCalibrations.push({
          userId: uid,
          calibrated: Boolean(profile),
          dominantPersona: profile?.dominantPersona,
          note: profile
            ? '已根据本次行程消费与反馈更新 Money DNA'
            : '暂无足够反馈完成校准',
        });
      } catch {
        profileCalibrations.push({
          userId: uid,
          calibrated: false,
          note: '校准跳过',
        });
      }
    }

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new BadRequestException(`行程 ${tripId} 不存在`);

    const fulfillmentReview = buildExperienceFulfillmentReview(trip.metadata);

    return {
      tripId,
      generatedAt: new Date().toISOString(),
      experienceHighlights,
      spendingReview: {
        totalSpentCny,
        budgetTotal,
        usagePercent,
        topCategory,
        currency: anchor?.budget.intent.currency ?? 'CNY',
      },
      teamReview: {
        averageScore:
          thermoRows.length > 0
            ? Math.round(
                (thermoRows.reduce((s, r) => s + r.score, 0) / thermoRows.length) * 100,
              ) / 100
            : 0.75,
        levelTrend: thermoRows.map((r) => ({
          dayNumber: r.dayNumber,
          level: r.level,
          score: r.score,
        })),
      },
      profileCalibrations,
      ...(fulfillmentReview ? { experienceFulfillmentReview: fulfillmentReview } : {}),
    };
  }
}
