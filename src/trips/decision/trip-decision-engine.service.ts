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
import { ReadinessService } from '../readiness/services/readiness.service';

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

  constructor(
    private readonly tools: SenseToolsAdapter,
    private readonly readinessService?: ReadinessService
  ) {}

  /**
   * 生成初始计划
   */
  async generatePlan(
    state: TripWorldState
  ): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
    if (!state || !state.context) {
      throw new Error('Invalid state: state and state.context are required');
    }

    // 可选：运行准备度检查（使用 Pack + 能力包 + 地理特征增强）
    if (this.readinessService) {
      try {
        const context = this.readinessService.extractTripContext(state);
        
        // 获取起始位置坐标（用于地理特征增强）
        // 优先使用第一天的酒店位置，如果没有则尝试从候选活动中获取
        const startLocation = state.context.anchors?.hotelLocationsByDate?.[state.context.startDate] ||
          state.candidatesByDate[state.context.startDate]?.[0]?.location?.point;
        
        const readinessResult = await this.readinessService.checkFromDestination(
          state.context.destination,
          context,
          {
            enhanceWithGeo: !!startLocation, // 只有有坐标时才启用地理特征增强
            geoLat: startLocation?.lat,
            geoLng: startLocation?.lng,
          }
        );
        
        // 记录准备度检查结果
        if (readinessResult.summary.totalBlockers > 0) {
          this.logger.warn(
            `Readiness check found ${readinessResult.summary.totalBlockers} blockers for destination ${state.context.destination}`
          );
        }
        
        if (readinessResult.summary.totalMust > 0) {
          this.logger.log(
            `Readiness check found ${readinessResult.summary.totalMust} must items for destination ${state.context.destination}`
          );
        }
        
        // 将 Readiness Findings 转换为 Constraints，影响决策
        const readinessConstraints = await this.readinessService.getConstraints(readinessResult);
        
        // 将 readiness 约束信息存储到 state 中，供后续决策使用
        // 通过 state.signals.alerts 传递准备度信息
        if (!state.signals.alerts) {
          state.signals.alerts = [];
        }
        
        // 添加准备度相关的 alerts
        for (const constraint of readinessConstraints) {
          if (constraint.type === 'hard' && constraint.severity === 'error') {
            state.signals.alerts.push({
              code: constraint.id,
              severity: 'critical' as const,
              message: constraint.message,
            });
          } else if (constraint.severity === 'warning') {
            state.signals.alerts.push({
              code: constraint.id,
              severity: 'warn' as const,
              message: constraint.message,
            });
          }
        }
        
        // 存储 readiness 结果到 state 中，供后续约束检查使用
        // 注意：这里使用了一个临时字段，实际应该扩展 TripWorldState 接口
        (state as any).readinessResult = readinessResult;
      } catch (error) {
        this.logger.warn(`Readiness check failed: ${error}`);
        // 不阻断计划生成，只记录警告
      }
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

