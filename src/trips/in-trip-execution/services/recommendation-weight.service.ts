import { Injectable, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import type {
  RecommendationWeightPatch,
  WeightAdjustmentNotice,
} from '../types/experience-loop.types';
import { clampDelta } from '../utils/experience-pulse.util';
import { mergeTripMetadata, parseTripMetadata } from '../utils/trip-metadata.util';

@Injectable()
export class RecommendationWeightService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async adjustNightly(tripId: string): Promise<RecommendationWeightPatch | null> {
    const since = DateTime.now().minus({ days: 3 }).toJSDate();

    const [pulses, thermo] = await Promise.all([
      this.prisma.tripExperiencePulse.findMany({
        where: { tripId, submittedAt: { gte: since } },
      }),
      this.prisma.tripTeamThermometerSnapshot.findMany({
        where: { tripId },
        orderBy: { dayNumber: 'desc' },
        take: 3,
      }),
    ]);

    if (pulses.length === 0) return null;

    const emotionalVals = pulses
      .map((p) => p.emotionalValueScore ?? p.expectationConfirmation)
      .filter((v): v is number => v != null);
    const avgEmotional =
      emotionalVals.length > 0
        ? emotionalVals.reduce((a, b) => a + b, 0) / emotionalVals.length
        : 3;

    const worthVals = pulses.map((p) => p.spendWorthIt).filter((v): v is number => v != null);
    const avgWorth =
      worthVals.length > 0 ? worthVals.reduce((a, b) => a + b, 0) / worthVals.length : 3;

    const teamVals = pulses.map((p) => p.teamAtmosphere).filter((v): v is number => v != null);
    const avgTeam =
      teamVals.length > 0 ? teamVals.reduce((a, b) => a + b, 0) / teamVals.length : 3;

    const thermoStress =
      thermo.length > 0
        ? thermo.filter((t) => t.level === 'orange' || t.level === 'red').length / thermo.length
        : 0;

    const activityIntensityDelta = clampDelta((avgEmotional - 3) / 2 - thermoStress * 0.3);
    const diningQualityDelta = clampDelta((avgWorth - 3) / 2);
    const museumDensityDelta = clampDelta((3 - avgEmotional) / 2);
    const bufferDayInserted = thermoStress > 0.5 && avgTeam < 3.5;

    const explanationZh = this.buildExplanation(
      activityIntensityDelta,
      diningQualityDelta,
      bufferDayInserted,
    );

    const patch: RecommendationWeightPatch = {
      activityIntensityDelta,
      diningQualityDelta,
      museumDensityDelta,
      bufferDayInserted,
      explanationZh,
      appliedAt: new Date().toISOString(),
    };

    await this.applyPatch(tripId, patch);
    return patch;
  }

  async getWeightAdjustments(tripId: string): Promise<{
    current: RecommendationWeightPatch | null;
    history: WeightAdjustmentNotice[];
  }> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    const meta = parseTripMetadata(trip?.metadata);
    return {
      current: meta.inTripRecommendationWeights ?? null,
      history: meta.inTripWeightAdjustmentHistory ?? [],
    };
  }

  async markAdjustmentsRead(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;
    const meta = parseTripMetadata(trip.metadata);
    const history = (meta.inTripWeightAdjustmentHistory ?? []).map((h) => ({
      ...h,
      unread: false,
    }));
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue(
          mergeTripMetadata(trip.metadata, { inTripWeightAdjustmentHistory: history }),
        ),
      },
    });
  }

  private async applyPatch(tripId: string, patch: RecommendationWeightPatch): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return;

    const meta = parseTripMetadata(trip.metadata);
    const history = meta.inTripWeightAdjustmentHistory ?? [];
    history.unshift({ appliedAt: patch.appliedAt, patch, unread: true });
    const trimmed = history.slice(0, 20);

    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue(
          mergeTripMetadata(trip.metadata, {
            inTripRecommendationWeights: patch,
            inTripWeightAdjustmentHistory: trimmed,
          }),
        ),
      },
    });

    await this.persistEvent(tripId, patch);
  }

  private buildExplanation(
    activityDelta: number,
    diningDelta: number,
    buffer: boolean,
  ): string {
    const parts: string[] = [];
    if (activityDelta > 0.15) parts.push('体验反馈积极，明日可提高活动强度');
    if (activityDelta < -0.15) parts.push('体验偏累，明日建议放缓节奏');
    if (diningDelta > 0.15) parts.push('餐饮心价比高，可适当提升品质');
    if (buffer) parts.push('团队压力偏高，建议插入缓冲时段');
    return parts.length > 0 ? parts.join('；') : '根据近 3 日微调查微调推荐权重';
  }

  private async persistEvent(tripId: string, patch: RecommendationWeightPatch): Promise<void> {
    if (!this.travelEventPersistence) return;
    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        tripId,
        segment: TrajectorySegment.ACTION,
        eventType: TravelEventType.TRIP_IN_TRIP_WEIGHT_ADJUSTED,
        source: TravelEventSource.IN_TRIP_EXECUTION,
        payload: { ...patch },
        idempotencyKey: `weight:${tripId}:${patch.appliedAt}`,
        schemaVersion: 1,
      }),
    );
  }
}
