import { BadRequestException, Injectable, Optional } from '@nestjs/common';
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
  ExperiencePulseSummary,
  ExperiencePulseTrigger,
  ExperienceTriggerType,
  SubmitExperiencePulseInput,
} from '../types/experience-loop.types';
import {
  buildTriggerKey,
  computeEmotionPolarity,
} from '../utils/experience-pulse.util';
import { defaultTripTimezone } from '../utils/in-trip-config.util';
import { resolveTripDayNumber } from '../utils/in-trip-day.util';
import { AnchorHandoffService } from './anchor-handoff.service';
import { InTripAccessService } from './in-trip-access.service';
import {
  appendOutcomeToMetadata,
  buildExperienceOutcomeRecord,
  extractPlannedAtomsFromTripMetadata,
} from '../../experience-fulfillment/utils/experience-outcome.util';

type PulseRow = {
  id: string;
  tripId: string;
  memberId: string;
  triggerType: string;
  activityName: string | null;
  expectationConfirmation: number | null;
  emotionalValueScore: number | null;
  senseOfControl: number | null;
  spendWorthIt: number | null;
  teamAtmosphere: number | null;
  freeText: string | null;
  emotionPolarity: number | null;
  submittedAt: Date;
};

@Injectable()
export class ExperiencePulseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: InTripAccessService,
    private readonly anchorHandoff: AnchorHandoffService,
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async getPending(tripId: string, userId: string): Promise<ExperiencePulseTrigger[]> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);

    const trip = await this.access.requireTrip(tripId);
    const dayNumber = resolveTripDayNumber(trip.startDate, trip.endDate);
    const anchor = await this.anchorHandoff.getSnapshot(tripId);
    const totalDays = anchor?.metadata.totalDays ?? dayNumber;
    const tz = defaultTripTimezone(trip.destination);
    const now = DateTime.now().setZone(tz);

    const submittedKeys = await this.loadSubmittedKeys(tripId, userId, dayNumber, now);
    const triggers: ExperiencePulseTrigger[] = [];

    if (now.hour >= 18 && now.hour < 21) {
      const key = buildTriggerKey('daily_review', { day: dayNumber });
      if (!submittedKeys.has(key)) {
        triggers.push({
          triggerType: 'daily_review',
          triggerKey: key,
          title: '今日回顾',
          prompt: '今天整体体验如何？花 30 秒帮我们校准明日推荐',
          priority: 2,
        });
      }
    }

    if (dayNumber >= totalDays) {
      const key = buildTriggerKey('last_day', { day: dayNumber });
      if (!submittedKeys.has(key)) {
        triggers.push({
          triggerType: 'last_day',
          triggerKey: key,
          title: '行程收官感受',
          prompt: '最后一天了，这次旅行对你来说意味着什么？',
          priority: 3,
        });
      }
    }

    const postDecision = await this.detectPostDecision(tripId, dayNumber, submittedKeys);
    triggers.push(...postDecision);

    const splitParty = await this.detectSplitParty(tripId, submittedKeys);
    triggers.push(...splitParty);

    const postActivity = await this.detectPostActivity(tripId, userId, dayNumber, submittedKeys);
    triggers.push(...postActivity);

    return triggers.sort((a, b) => b.priority - a.priority);
  }

  async countPending(tripId: string, userId: string): Promise<number> {
    try {
      const pending = await this.getPending(tripId, userId);
      return pending.length;
    } catch {
      return 0;
    }
  }

  async submit(
    tripId: string,
    userId: string,
    input: SubmitExperiencePulseInput,
  ): Promise<ExperiencePulseSummary> {
    await this.access.assertInTripPhase(tripId);
    await this.access.assertTripMember(tripId, userId);
    this.validateScores(input);

    const emotionPolarity = computeEmotionPolarity(input);
    const row = await this.prisma.tripExperiencePulse.create({
      data: {
        tripId,
        memberId: userId,
        triggerType: input.triggerType,
        activityName: input.activityName ?? null,
        expectationConfirmation: input.expectationConfirmation ?? null,
        emotionalValueScore: input.emotionalValueScore ?? null,
        senseOfControl: input.senseOfControl ?? null,
        spendWorthIt: input.spendWorthIt ?? null,
        teamAtmosphere: input.teamAtmosphere ?? null,
        freeText: input.freeText ?? null,
        emotionPolarity,
        submittedAt: new Date(),
      },
    });

    await this.persistEvent(tripId, userId, row.id, input.triggerType);
    await this.recordExperienceOutcome(tripId, userId, input);
    return this.toSummary(row);
  }

  private async recordExperienceOutcome(
    tripId: string,
    userId: string,
    input: SubmitExperiencePulseInput,
  ): Promise<void> {
    if (!input.experienceTagMatch && !input.expectationConfirmation) return;
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return;
      const plannedAtoms = extractPlannedAtomsFromTripMetadata(trip.metadata);
      const record = buildExperienceOutcomeRecord({
        tripId,
        memberId: userId,
        input,
        plannedAtoms,
      });
      const merged = appendOutcomeToMetadata(trip.metadata, record);
      await this.prisma.trip.update({
        where: { id: tripId },
        data: { metadata: toInputJsonValue(merged) },
      });
    } catch {
      // fail-open：不影响微调查主流程
    }
  }

  async listHistory(
    tripId: string,
    userId: string,
    options: { limit?: number; offset?: number } = {},
  ): Promise<{ items: ExperiencePulseSummary[]; total: number; limit: number; offset: number }> {
    await this.access.assertTripMember(tripId, userId);

    const limit = options.limit ?? 30;
    const offset = options.offset ?? 0;
    const where = { tripId };

    const [rows, total] = await Promise.all([
      this.prisma.tripExperiencePulse.findMany({
        where,
        orderBy: { submittedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.tripExperiencePulse.count({ where }),
    ]);

    return {
      items: rows.map((r) => this.toSummary(r)),
      total,
      limit,
      offset,
    };
  }

  private async loadSubmittedKeys(
    tripId: string,
    userId: string,
    dayNumber: number,
    now: DateTime,
  ): Promise<Set<string>> {
    const startOfDay = now.startOf('day').toJSDate();
    const rows = await this.prisma.tripExperiencePulse.findMany({
      where: { tripId, memberId: userId, submittedAt: { gte: startOfDay } },
      select: { triggerType: true, activityName: true },
    });

    const keys = new Set<string>();
    for (const r of rows) {
      if (r.triggerType === 'post_activity' && r.activityName) {
        keys.add(buildTriggerKey('post_activity', { activity: r.activityName, day: dayNumber }));
      } else if (r.triggerType === 'post_decision') {
        keys.add(buildTriggerKey('post_decision', { day: dayNumber }));
      } else if (r.triggerType === 'split_party') {
        keys.add(buildTriggerKey('split_party', { day: dayNumber }));
      } else if (r.triggerType === 'daily_review') {
        keys.add(buildTriggerKey('daily_review', { day: dayNumber }));
      } else if (r.triggerType === 'last_day') {
        keys.add(buildTriggerKey('last_day', { day: dayNumber }));
      }
    }
    return keys;
  }

  private async detectPostDecision(
    tripId: string,
    dayNumber: number,
    submittedKeys: Set<string>,
  ): Promise<ExperiencePulseTrigger[]> {
    const key = buildTriggerKey('post_decision', { day: dayNumber });
    if (submittedKeys.has(key)) return [];

    const since = DateTime.now().minus({ hours: 24 }).toJSDate();
    const [resolvedEnv, executedSplit, acceptedRebalance] = await Promise.all([
      this.prisma.tripEnvironmentEvent.count({
        where: { tripId, status: 'resolved', resolvedAt: { gte: since } },
      }),
      this.prisma.tripSplitPartySession.count({
        where: { tripId, status: 'active', executedAt: { gte: since } },
      }),
      this.prisma.tripBudgetRebalanceSuggestion.count({
        where: { tripId, status: 'accepted', respondedAt: { gte: since } },
      }),
    ]);

    if (resolvedEnv + executedSplit + acceptedRebalance === 0) return [];

    return [
      {
        triggerType: 'post_decision',
        triggerKey: key,
        title: '决策后感受',
        prompt: '刚做完一个重要决定，现在感觉如何？',
        priority: 4,
      },
    ];
  }

  private async detectSplitParty(
    tripId: string,
    submittedKeys: Set<string>,
  ): Promise<ExperiencePulseTrigger[]> {
    const since = DateTime.now().minus({ hours: 2 }).toJSDate();
    const reunited = await this.prisma.tripSplitPartySession.findFirst({
      where: {
        tripId,
        status: 'reunited',
        executedAt: { gte: since },
      },
      orderBy: { executedAt: 'desc' },
    });
    if (!reunited) return [];

    const day = reunited.dayNumber;
    const key = buildTriggerKey('split_party', { day });
    if (submittedKeys.has(key)) return [];

    return [
      {
        triggerType: 'split_party',
        triggerKey: key,
        title: '分组探索后',
        prompt: '分开行动后的体验怎么样？',
        priority: 5,
      },
    ];
  }

  private async detectPostActivity(
    tripId: string,
    userId: string,
    dayNumber: number,
    submittedKeys: Set<string>,
  ): Promise<ExperiencePulseTrigger[]> {
    const startOfDay = DateTime.now().startOf('day').toJSDate();
    const txs = await this.prisma.tripSmartTransaction.findMany({
      where: {
        tripId,
        memberId: userId,
        recordedAt: { gte: startOfDay },
        bucketAssignment: 'experience',
      },
      orderBy: { amountCny: 'desc' },
      take: 3,
    });

    const triggers: ExperiencePulseTrigger[] = [];
    for (const tx of txs) {
      const name = tx.merchant ?? tx.description ?? tx.category;
      const key = buildTriggerKey('post_activity', { activity: name, day: dayNumber });
      if (submittedKeys.has(key)) continue;
      if (tx.amountCny < 200) continue;

      triggers.push({
        triggerType: 'post_activity',
        triggerKey: key,
        title: '活动体验反馈',
        prompt: `「${name}」值得吗？`,
        activityName: name,
        priority: 6,
      });
    }
    return triggers;
  }

  private validateScores(input: SubmitExperiencePulseInput): void {
    const fields = [
      input.expectationConfirmation,
      input.emotionalValueScore,
      input.senseOfControl,
      input.spendWorthIt,
      input.teamAtmosphere,
    ];
    for (const v of fields) {
      if (v != null && (!Number.isInteger(v) || v < 1 || v > 5)) {
        throw new BadRequestException('评分字段须为 1–5 的整数');
      }
    }
    const allowed: ExperienceTriggerType[] = [
      'post_activity',
      'post_decision',
      'daily_review',
      'split_party',
      'last_day',
    ];
    if (!allowed.includes(input.triggerType)) {
      throw new BadRequestException(`triggerType 无效: ${input.triggerType}`);
    }
  }

  private toSummary(row: PulseRow): ExperiencePulseSummary {
    return {
      id: row.id,
      tripId: row.tripId,
      memberId: row.memberId,
      triggerType: row.triggerType as ExperienceTriggerType,
      activityName: row.activityName,
      expectationConfirmation: row.expectationConfirmation,
      emotionalValueScore: row.emotionalValueScore,
      senseOfControl: row.senseOfControl,
      spendWorthIt: row.spendWorthIt,
      teamAtmosphere: row.teamAtmosphere,
      freeText: row.freeText,
      emotionPolarity: row.emotionPolarity,
      submittedAt: row.submittedAt.toISOString(),
    };
  }

  private async persistEvent(
    tripId: string,
    userId: string,
    pulseId: string,
    triggerType: string,
  ): Promise<void> {
    if (!this.travelEventPersistence) return;
    await this.travelEventPersistence.persist(
      buildTravelEventEnvelope({
        tripId,
        segment: TrajectorySegment.RESULT,
        eventType: TravelEventType.TRIP_IN_TRIP_EXPERIENCE_PULSE_SUBMITTED,
        source: TravelEventSource.IN_TRIP_EXECUTION,
        userId,
        payload: { pulseId, triggerType },
        idempotencyKey: `pulse:${pulseId}`,
        schemaVersion: 1,
      }),
    );
  }
}
