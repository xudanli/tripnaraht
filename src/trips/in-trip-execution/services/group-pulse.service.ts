import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { TravelEventPersistenceService } from '../../event-store/travel-event-persistence.service';
import {
  TrajectorySegment,
  TravelEventSource,
  TravelEventType,
} from '../../event-store/types/travel-event.types';
import { buildTravelEventEnvelope } from '../../event-store/travel-event-envelope.builder';
import type {
  AckInterventionInput,
  InterventionCard,
  MemberStateVector,
  MicroFeedbackInput,
  MoodCheckInput,
  MotionSignalInput,
  TeamThermometerSnapshot,
} from '../types/group-pulse.types';
import { resolveTripDayNumber } from '../utils/in-trip-day.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { InTripAccessService } from './in-trip-access.service';
import { MemberStateVectorService } from './member-state-vector.service';
import { ProtectiveInterventionService } from './protective-intervention.service';
import { RelationRiskService } from './relation-risk.service';
import { TeamThermometerService } from './team-thermometer.service';

@Injectable()
export class GroupPulseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
    private readonly stateVector: MemberStateVectorService,
    private readonly thermometer: TeamThermometerService,
    private readonly relationRisk: RelationRiskService,
    private readonly interventions: ProtectiveInterventionService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async submitMoodCheck(
    tripId: string,
    userId: string,
    input: MoodCheckInput,
  ): Promise<MemberStateVector> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    this.assertScore(input.score);

    const trip = await this.access.requireTrip(tripId);
    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);
    const source = input.source ?? 'mood_check';

    await this.prisma.tripMoodCheck.upsert({
      where: {
        tripId_userId_dayNumber_source: { tripId, userId, dayNumber, source },
      },
      create: {
        tripId,
        userId,
        dayNumber,
        score: input.score,
        source,
      },
      update: { score: input.score },
    });

    const state = await this.stateVector.recompute(tripId, userId, {
      moodScore: input.score,
      dayNumber,
    });
    await this.afterSignalUpdate(tripId, dayNumber);
    return state;
  }

  async submitMicroFeedback(
    tripId: string,
    userId: string,
    input: MicroFeedbackInput,
  ): Promise<{ recorded: boolean; state: MemberStateVector }> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    this.assertScore(input.score);

    const trip = await this.access.requireTrip(tripId);
    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);

    const state = await this.stateVector.recompute(tripId, userId, {
      moodScore: input.score,
      dayNumber,
    });
    await this.afterSignalUpdate(tripId, dayNumber);
    return { recorded: true, state };
  }

  async submitMotion(
    tripId: string,
    userId: string,
    input: MotionSignalInput,
  ): Promise<MemberStateVector> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const trip = await this.access.requireTrip(tripId);
    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);

    const state = await this.stateVector.recompute(tripId, userId, {
      motion: input,
      dayNumber,
    });
    await this.afterSignalUpdate(tripId, dayNumber);
    return state;
  }

  async getMyState(tripId: string, userId: string): Promise<MemberStateVector> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const trip = await this.access.requireTrip(tripId);
    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);

    const existing = await this.stateVector.getState(tripId, userId, dayNumber);
    if (existing) return existing;
    return this.stateVector.recompute(tripId, userId, { dayNumber });
  }

  async getTeamThermometer(
    tripId: string,
    userId: string,
  ): Promise<TeamThermometerSnapshot> {
    const trip = await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const isOrganizer = this.access.isOrganizer(trip, userId);
    const snap = await this.thermometer.getSnapshot(tripId, userId, isOrganizer);

    return {
      tripId: snap.tripId,
      dayNumber: snap.dayNumber,
      level: snap.level as TeamThermometerSnapshot['level'],
      score: snap.score,
      factors: snap.factors as TeamThermometerSnapshot['factors'],
      memberCards: snap.memberCards.map((m) => ({
        userId: m.userId,
        displayName: m.displayName,
        level: m.level as TeamThermometerSnapshot['memberCards'][0]['level'],
      })),
      visible: snap.visible,
      computedAt: snap.computedAt ?? new Date().toISOString(),
    };
  }

  async listInterventions(tripId: string, userId: string): Promise<InterventionCard[]> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    return this.interventions.listPending(tripId);
  }

  async ackIntervention(
    tripId: string,
    interventionId: string,
    userId: string,
    input: AckInterventionInput,
  ): Promise<InterventionCard> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    return this.interventions.acknowledge(tripId, interventionId, userId, input.action);
  }

  async countPendingInterventions(tripId: string): Promise<number> {
    return this.interventions.countPending(tripId);
  }

  private async afterSignalUpdate(tripId: string, dayNumber: number): Promise<void> {
    await this.thermometer.computeAndPersist(tripId, dayNumber);
    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const hits = await this.relationRisk.evaluate(tripId, dayNumber, anchor);
    await this.interventions.syncFromRisks(tripId, dayNumber, hits);

    await this.persistStateEvent(tripId, dayNumber);
  }

  private assertScore(score: number): void {
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      throw new BadRequestException('score 须为 1–5 的整数');
    }
  }

  private async persistStateEvent(tripId: string, dayNumber: number): Promise<void> {
    if (!this.travelEventPersistence) return;
    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        tripId,
        segment: TrajectorySegment.ACTION,
        eventType: TravelEventType.TRIP_IN_TRIP_STATE_VECTOR_UPDATED,
        source: TravelEventSource.IN_TRIP_EXECUTION,
        payload: { dayNumber },
        idempotencyKey: `state:${tripId}:${dayNumber}:${Date.now()}`,
        schemaVersion: 1,
      }),
    );
  }
}
