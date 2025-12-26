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
import { PoiFeaturesAdapterService, PoiFeatures } from './services/poi-features-adapter.service';
import { RouteDirectionSelectorService, UserIntent } from '../../route-directions/services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from '../../route-directions/services/route-direction-poi-generator.service';

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
    private readonly readinessService?: ReadinessService,
    private readonly poiFeaturesAdapter?: PoiFeaturesAdapterService,
    private readonly routeDirectionSelector?: RouteDirectionSelectorService,
    private readonly routeDirectionPoiGenerator?: RouteDirectionPoiGeneratorService
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

    // Step 1: 选择路线方向（如果支持）
    let selectedRouteDirection: any = null;
    if (this.routeDirectionSelector) {
      try {
        const countryCode = this.extractCountryCode(state.context.destination);
        const month = this.extractMonth(state.context.startDate);
        const userIntent: UserIntent = {
          preferences: this.extractPreferences(state.context.preferences),
          pace: state.context.preferences.pace,
          riskTolerance: state.context.preferences.riskTolerance,
          durationDays: state.context.durationDays,
        };

        const recommendations = await this.routeDirectionSelector.pickRouteDirections(
          userIntent,
          countryCode,
          month
        );

        if (recommendations.length > 0) {
          selectedRouteDirection = recommendations[0]; // 选择 Top 1
          this.logger.log(
            `选择了路线方向: ${selectedRouteDirection.routeDirection.name} (score: ${selectedRouteDirection.score})`
          );

          // 将约束注入到 world model
          if (selectedRouteDirection.constraints) {
            this.injectConstraints(state, selectedRouteDirection.constraints);
          }

          // 根据路线方向生成候选 POI
          if (this.routeDirectionPoiGenerator) {
            const routePois = await this.routeDirectionPoiGenerator.generateCandidatePois(
              selectedRouteDirection,
              selectedRouteDirection.routeDirection.regions
            );

            // 将路线方向的 POI 添加到候选池
            this.mergeCandidatePois(state, routePois);
          }
        }
      } catch (error) {
        this.logger.warn(`Route direction selection failed: ${error}`);
        // 不阻断计划生成，继续使用原有候选池
      }
    }

    // 可选：获取 POI Features（用于决策优化）
    let poiFeatures: PoiFeatures | null = null;
    if (this.poiFeaturesAdapter) {
      try {
        poiFeatures = await this.poiFeaturesAdapter.getPoiFeatures({
          destination: state.context.destination,
        });
        if (poiFeatures) {
          this.logger.log(`Loaded POI Features for destination: ${state.context.destination}`);
        }
      } catch (error) {
        this.logger.warn(`Failed to load POI Features: ${error}`);
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

  /**
   * 从目的地提取国家代码
   */
  private extractCountryCode(destination: string): string {
    // 支持格式：NZ, NP, CN_XZ, IS-REYKJAVIK, SVALBARD_LONGYEARBYEN
    if (destination.startsWith('CN_')) {
      return destination.split('_')[0] + '_' + destination.split('_')[1];
    }
    if (destination.includes('-')) {
      return destination.split('-')[0];
    }
    if (destination.includes('_')) {
      const parts = destination.split('_');
      return parts[0];
    }
    return destination.substring(0, 2).toUpperCase();
  }

  /**
   * 从日期提取月份
   */
  private extractMonth(date: string): number {
    // date 格式：YYYY-MM-DD
    const parts = date.split('-');
    if (parts.length >= 2) {
      return parseInt(parts[1], 10);
    }
    return new Date().getMonth() + 1;
  }

  /**
   * 从用户偏好提取标签
   */
  private extractPreferences(preferences: any): string[] {
    const tags: string[] = [];
    
    // 从 intents 中提取
    if (preferences.intents && typeof preferences.intents === 'object') {
      Object.keys(preferences.intents).forEach(key => {
        if (preferences.intents[key] > 0.5) {
          tags.push(key);
        }
      });
    }

    return tags;
  }

  /**
   * 将约束注入到 world model（区分硬约束/软约束/目标函数权重）
   */
  private injectConstraints(state: TripWorldState, constraints: any): void {
    // 将约束存储到 state 的 metadata 中，供后续策略使用
    if (!state.policies) {
      state.policies = {};
    }

    const policies = state.policies as any;

    // 解析约束结构（支持新格式和旧格式兼容）
    const hardConstraints = constraints.hard || {};
    const softConstraints = constraints.soft || {};
    const objectives = constraints.objectives || {};

    // 硬约束（违反就必须修复/降级）
    if (hardConstraints.maxDailyRapidAscentM !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.maxDailyRapidAscentM = hardConstraints.maxDailyRapidAscentM;
    }
    if (hardConstraints.maxSlopePct !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.maxSlopePct = hardConstraints.maxSlopePct;
    }
    if (hardConstraints.rapidAscentForbidden !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.rapidAscentForbidden = hardConstraints.rapidAscentForbidden;
    }
    if (hardConstraints.requiresPermit !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.requiresPermit = hardConstraints.requiresPermit;
    }
    if (hardConstraints.requiresGuide !== undefined) {
      policies.hardConstraints = policies.hardConstraints || {};
      policies.hardConstraints.requiresGuide = hardConstraints.requiresGuide;
    }

    // 软约束（尽量满足，超了就加惩罚）
    if (softConstraints.maxDailyAscentM !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      policies.softConstraints.maxDailyAscentM = softConstraints.maxDailyAscentM;
    }
    if (softConstraints.maxElevationM !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      policies.softConstraints.maxElevationM = softConstraints.maxElevationM;
    }
    if (softConstraints.bufferTimeMin !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      policies.softConstraints.bufferTimeMin = softConstraints.bufferTimeMin;
    }

    // 目标函数权重（影响排序）
    if (objectives.preferViewpoints !== undefined) {
      policies.objectives = policies.objectives || {};
      policies.objectives.preferViewpoints = objectives.preferViewpoints;
    }
    if (objectives.preferHotSpring !== undefined) {
      policies.objectives = policies.objectives || {};
      policies.objectives.preferHotSpring = objectives.preferHotSpring;
    }
    if (objectives.preferPhotography !== undefined) {
      policies.objectives = policies.objectives || {};
      policies.objectives.preferPhotography = objectives.preferPhotography;
    }

    // 兼容旧版本字段（如果没有新格式，使用旧格式）
    if (!constraints.hard && !constraints.soft) {
      if (constraints.maxElevationM) {
        policies.softConstraints = policies.softConstraints || {};
        policies.softConstraints.maxElevationM = constraints.maxElevationM;
      }
      if (constraints.maxDailyAscentM) {
        policies.softConstraints = policies.softConstraints || {};
        policies.softConstraints.maxDailyAscentM = constraints.maxDailyAscentM;
      }
      if (constraints.maxSlope) {
        policies.hardConstraints = policies.hardConstraints || {};
        policies.hardConstraints.maxSlopePct = constraints.maxSlope;
      }
      if (constraints.rapidAscentForbidden) {
        policies.hardConstraints = policies.hardConstraints || {};
        policies.hardConstraints.rapidAscentForbidden = constraints.rapidAscentForbidden;
      }
    }

    this.logger.log(
      `注入了约束: hard=${JSON.stringify(policies.hardConstraints)}, soft=${JSON.stringify(policies.softConstraints)}, objectives=${JSON.stringify(policies.objectives)}`
    );
  }

  /**
   * 合并候选 POI
   */
  private mergeCandidatePois(state: TripWorldState, routePois: any[]): void {
    // 将路线方向的 POI 添加到每日候选池
    for (let i = 0; i < state.context.durationDays; i++) {
      const date = addDays(state.context.startDate, i);
      if (!state.candidatesByDate[date]) {
        state.candidatesByDate[date] = [];
      }

      // 添加路线方向的 POI（避免重复）
      for (const poi of routePois) {
        if (!state.candidatesByDate[date].find(c => c.id === poi.id)) {
          state.candidatesByDate[date].push(poi);
        }
      }
    }

    this.logger.log(`合并了 ${routePois.length} 个路线方向 POI 到候选池`);
  }
}

// minimal date helper (local date math: YYYY-MM-DD)
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

