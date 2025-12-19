// src/trips/decision/trip-decision-engine.service.ts

/**
 * Trip Decision Engine Service
 * 
 * 决策神经系统的核心：整合 Abu、Dr.Dre、Neptune 三个策略
 * 只做决策，不做 UI，不做爬取
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripWorldState, TravelLeg, GeoPoint } from './world-model';
import { TripPlan } from './plan-model';
import { abuSelectCoreActivities } from './strategies/abu';
import { drdreBuildDaySchedule } from './strategies/drdre';
import { neptuneRepairPlan } from './strategies/neptune';
import { DecisionRunLog, DecisionTrigger } from './decision-log';
import { SenseToolsAdapter } from './adapters/sense-tools.adapter';

export interface SenseTools {
  // keep it small: you can adapt to your existing services
  getHotelPointForDate?: (date: string) => Promise<GeoPoint | undefined>;
  getTravelLeg: (
    from: GeoPoint,
    to: GeoPoint
  ) => Promise<TravelLeg>;
}

@Injectable()
export class TripDecisionEngineService {
  private readonly logger = new Logger(TripDecisionEngineService.name);

  constructor(private readonly tools: SenseToolsAdapter) {}

  /**
   * 生成初始计划
   */
  async generatePlan(
    state: TripWorldState
  ): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
    if (!state || !state.context) {
      throw new Error('Invalid state: state and state.context are required');
    }

    const now = new Date().toISOString();
    const dayStart = state.policies?.dayStart ?? '08:30';
    const dayEnd = state.policies?.dayEnd ?? '20:30';
    const buffer = state.policies?.bufferMinBetweenActivities ?? 10;

    const days: TripPlan['days'] = [];

    for (let i = 0; i < state.context.durationDays; i++) {
      const date = addDays(state.context.startDate, i);
      const pool = state.candidatesByDate[date] || [];

      // Abu: choose what to keep under daily limits (rough by pace)
      const maxActiveMin =
        state.context.preferences.pace === 'relaxed'
          ? 240
          : state.context.preferences.pace === 'intense'
            ? 420
            : 330;

      const abu = abuSelectCoreActivities(state, date, pool, {
        maxActiveMin,
        maxCost: state.context.budget?.amount,
      });

      // DrDre: schedule them into a day timeline
      const hotelPoint =
        state.context.anchors?.hotelLocationsByDate?.[date] ||
        (this.tools.getHotelPointForDate
          ? await this.tools.getHotelPointForDate(date)
          : undefined);

      const slots = await drdreBuildDaySchedule(
        state,
        {
          date,
          startTime: dayStart,
          endTime: dayEnd,
          bufferMin: buffer,
          startPoint: hotelPoint,
        },
        abu.kept,
        this.tools.getTravelLeg
      );

      days.push({ day: i + 1, date, timeSlots: slots });
    }

    const plan: TripPlan = {
      version: 'planner-0.1',
      createdAt: now,
      days,
    };

    const log: DecisionRunLog = {
      runId: `run_${Date.now()}`,
      at: now,
      trigger: 'initial_generate',
      plannerVersion: plan.version,
      strategyMix: ['abu', 'drdre'],
      inputDigest: {
        destination: state.context.destination,
        startDate: state.context.startDate,
        durationDays: state.context.durationDays,
        signalUpdatedAt: state.signals.lastUpdatedAt,
      },
      chosenActions: [
        {
          actionType: 'prioritize',
          reasonCodes: ['RISK_BASED'],
          payload: { days: state.context.durationDays },
        },
      ],
      explanation:
        'Generated plan using Abu(core selection) + DrDre(day scheduling).',
    };

    return { plan, log };
  }

  /**
   * 修复计划（当世界状态变化时）
   */
  repairPlan(
    state: TripWorldState,
    plan: TripPlan,
    trigger: DecisionTrigger = 'signal_update'
  ): { plan: TripPlan; log: DecisionRunLog } {
    if (!state || !state.context) {
      throw new Error('Invalid state: state and state.context are required');
    }
    if (!plan) {
      throw new Error('Invalid plan: plan is required');
    }

    const now = new Date().toISOString();

    const repaired = neptuneRepairPlan(state, plan);

    const log: DecisionRunLog = {
      runId: `run_${Date.now()}`,
      at: now,
      trigger,
      plannerVersion: plan.version,
      strategyMix: ['neptune'],
      inputDigest: {
        destination: state.context.destination,
        startDate: state.context.startDate,
        durationDays: state.context.durationDays,
        signalUpdatedAt: state.signals.lastUpdatedAt,
      },
      violations: repaired.triggers.map(t => ({
        code: t.code,
        date: t.date,
        slotId: t.slotId,
        details: t.details,
      })),
      chosenActions: repaired.changedSlotIds.map(id => ({
        actionType: 'swap',
        reasonCodes: ['MIN_EDIT_REPAIR'],
        payload: { slotId: id },
      })),
      diff: {
        changedSlots: repaired.changedSlotIds.length,
        movedSlots: 0,
        removedSlots: 0,
        addedSlots: 0,
        editDistanceScore: repaired.changedSlotIds.length, // MVP
      },
      explanation: repaired.explanation,
    };

    return { plan: repaired.plan, log };
  }
}

// minimal date helper (local date math: YYYY-MM-DD)
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

