/**
 * 行中执行反馈 — 写入与聚合为 crowding 快照
 */

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { PoiCrowdingSnapshot } from '../interfaces/poi-access-capacity.interface';

export type RecordPoiExecutionFeedbackInput = {
  poiId: string;
  placeId?: number;
  tripId?: string;
  dateISO: string;
  arrivalTime?: string;
  parkingWaitMin?: number;
  visitDurationMin?: number;
  couldNotPark?: boolean;
  abandonedDueToCrowd?: boolean;
  crowdLevelSubjective?: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  notes?: string;
};

@Injectable()
export class PoiExecutionFeedbackService {
  private readonly logger = new Logger(PoiExecutionFeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordFeedback(input: RecordPoiExecutionFeedbackInput): Promise<{ id: string }> {
    if (!input.poiId?.trim()) {
      throw new BadRequestException('poiId 必填');
    }
    if (!input.dateISO?.trim()) {
      throw new BadRequestException('dateISO 必填');
    }

    const row = await this.prisma.poiExecutionFeedback.create({
      data: {
        poiId: input.poiId,
        placeId: input.placeId ?? null,
        tripId: input.tripId ?? null,
        dateISO: input.dateISO.slice(0, 10),
        arrivalTime: input.arrivalTime ?? null,
        parkingWaitMin: input.parkingWaitMin ?? null,
        visitDurationMin: input.visitDurationMin ?? null,
        couldNotPark: input.couldNotPark ?? false,
        abandonedDueToCrowd: input.abandonedDueToCrowd ?? false,
        crowdLevelSubjective: input.crowdLevelSubjective ?? null,
        notes: input.notes ?? null,
      },
    });
    return { id: row.id };
  }

  /** 写入反馈并聚合为 crowding 快照（在线 / 离线 sync 共用） */
  async recordAndAggregate(input: RecordPoiExecutionFeedbackInput): Promise<{
    id: string;
    aggregatedSnapshot?: PoiCrowdingSnapshot;
  }> {
    const { id } = await this.recordFeedback(input);
    const aggregatedSnapshot = await this.aggregateFeedbackToCrowdingSnapshot(input.poiId);
    return { id, aggregatedSnapshot };
  }

  /** 近 N 天反馈聚合（只读，不写 DB） */
  async getAggregatedCrowdingFromFeedback(
    poiId: string,
    lookbackDays = 30,
  ): Promise<PoiCrowdingSnapshot | undefined> {
    const since = new Date();
    since.setDate(since.getDate() - lookbackDays);

    const rows = await this.prisma.poiExecutionFeedback.findMany({
      where: { poiId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    if (!rows.length) return undefined;

    const waits = rows
      .map((r) => r.parkingWaitMin)
      .filter((w): w is number => w != null && Number.isFinite(w))
      .sort((a, b) => a - b);

    const p50 = waits.length ? waits[Math.floor(waits.length * 0.5)] : undefined;
    const p90 = waits.length ? waits[Math.floor(waits.length * 0.9)] : undefined;
    const couldNotParkRate =
      rows.filter((r) => r.couldNotPark || r.abandonedDueToCrowd).length / rows.length;

    let crowdLevel: PoiCrowdingSnapshot['crowdLevel'] = 'LOW';
    if (couldNotParkRate >= 0.35 || (p50 != null && p50 >= 30)) crowdLevel = 'HIGH';
    else if (couldNotParkRate >= 0.15 || (p50 != null && p50 >= 15)) crowdLevel = 'MEDIUM';

    return {
      poiId,
      observedAt: new Date().toISOString(),
      predictedWaitP50: p50,
      predictedWaitP90: p90,
      crowdLevel,
      parkingOccupancyRatio: Math.min(1, couldNotParkRate + 0.3),
      signalSources: ['USER'],
      confidenceScore: Math.min(0.9, 0.4 + rows.length * 0.02),
    };
  }

  /** 近 N 天反馈聚合 → 写入 crowding 快照表 */
  async aggregateFeedbackToCrowdingSnapshot(
    poiId: string,
    lookbackDays = 30,
  ): Promise<PoiCrowdingSnapshot | undefined> {
    const snapshot = await this.getAggregatedCrowdingFromFeedback(poiId, lookbackDays);
    if (!snapshot) return undefined;

    await this.prisma.poiCrowdingSnapshot.create({
      data: {
        poiId,
        observedAt: new Date(snapshot.observedAt),
        predictedWaitP50: snapshot.predictedWaitP50 ?? null,
        predictedWaitP90: snapshot.predictedWaitP90 ?? null,
        crowdLevel: snapshot.crowdLevel,
        parkingOccupancyRatio: snapshot.parkingOccupancyRatio ?? null,
        signalSources: snapshot.signalSources,
        confidenceScore: snapshot.confidenceScore,
      },
    });

    this.logger.debug(`聚合 USER 反馈快照 → ${poiId} crowd=${snapshot.crowdLevel}`);
    return snapshot;
  }
}
