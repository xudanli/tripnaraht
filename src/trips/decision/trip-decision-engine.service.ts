// src/trips/decision/trip-decision-engine.service.ts

/**
 * Trip Decision Engine Service
 * 
 * 决策神经系统的核心：整合 Abu、Dr.Dre、Neptune 三个策略
 * 只做决策，不做 UI，不做爬取
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripWorldState, TravelLeg, GeoPoint, ActivityCandidate } from './world-model';
import { TripPlan, PlanDay, PlanSlot } from './plan-model';
import { abuSelectCoreActivities } from './strategies/abu';
import { drdreBuildDaySchedule } from './strategies/drdre';
import { neptuneRepairPlan } from './strategies/neptune';
import { DecisionRunLog, DecisionTrigger } from './decision-log';
import { SenseToolsAdapter } from './adapters/sense-tools.adapter';
import { ReadinessService } from '../readiness/services/readiness.service';
import { PoiFeaturesAdapterService, PoiFeatures } from './services/poi-features-adapter.service';
import { RouteDirectionSelectorService, UserIntent } from '../../route-directions/services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from '../../route-directions/services/route-direction-poi-generator.service';
import { RouteDirectionObservabilityService } from '../../route-directions/services/route-direction-observability.service';
import { CompliancePluginService } from '../../route-directions/plugins/compliance-plugin.service';
import { TransportPluginService } from '../../route-directions/plugins/transport-plugin.service';
import { getPolicyProfile, POLICY_PROFILES } from './config/objective-config';
import { DEMDailyEnergyService } from './services/dem-daily-energy.service';

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
    private readonly routeDirectionPoiGenerator?: RouteDirectionPoiGeneratorService,
    private readonly observabilityService?: RouteDirectionObservabilityService,
    private readonly compliancePlugin?: CompliancePluginService,
    private readonly transportPlugin?: TransportPluginService,
    private readonly demDailyEnergyService?: DEMDailyEnergyService
  ) {}

  /**
   * 生成初始计划
   */
  async generatePlan(
    state: TripWorldState,
    requestId?: string
  ): Promise<{ plan: TripPlan; log: DecisionRunLog }> {
    if (!state || !state.context) {
      throw new Error('Invalid state: state and state.context are required');
    }

    // 创建观测 trace
    const traceRequestId = requestId || `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (this.observabilityService) {
      this.observabilityService.createTrace(traceRequestId);
      
      // 记录初始 POI pool 大小
      const initialPoolSize = Object.values(state.candidatesByDate).reduce(
        (sum, candidates) => sum + candidates.length,
        0
      );
      this.observabilityService.recordPoiPoolSize(traceRequestId, initialPoolSize, 'initial');
    }

    const planGenerateStartTime = Date.now();

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
          month,
          traceRequestId
        );

        if (recommendations.length > 0) {
          selectedRouteDirection = recommendations[0]; // 选择 Top 1
          this.logger.log(
            `选择了路线方向: ${selectedRouteDirection.routeDirection.name} (score: ${selectedRouteDirection.score})`
          );

          // 将约束注入到 world model
          if (selectedRouteDirection.constraints) {
            const constraintsInjectStartTime = Date.now();
            this.injectConstraints(state, selectedRouteDirection.constraints);
            if (this.observabilityService) {
              this.observabilityService.recordConstraintsInjectLatency(
                traceRequestId,
                Date.now() - constraintsInjectStartTime
              );
            }
          }

          // 生成合规检查清单（如果支持）
          if (this.compliancePlugin) {
            try {
              const complianceChecklist = this.compliancePlugin.generateChecklist(
                selectedRouteDirection,
                undefined, // itinerary draft 将在计划生成后更新
                selectedRouteDirection.routeDirection.regions,
                undefined, // poiTypes 可以从 state 中提取
                (state.context as any).complianceStatus // 用户合规状态
              );

              // 如果用户明确拒绝办理，且存在 hard 项，触发降级
              if (complianceChecklist.userActionRequired.hard.length > 0 && 
                  complianceChecklist.downgradeOptions) {
                this.logger.warn(
                  `用户拒绝办理合规项，触发降级：${complianceChecklist.downgradeOptions.reason}`
                );
                // 将降级选项存储到 state 中，供后续策略使用
                (state as any).complianceDowngrade = complianceChecklist.downgradeOptions;
              }

              // 将合规检查清单存储到 state 中
              (state as any).complianceChecklist = complianceChecklist;
            } catch (error) {
              this.logger.warn(`合规检查失败: ${error}`);
            }
          }

          // 生成交通模式检查清单（如果支持）
          if (this.transportPlugin) {
            try {
              const transportChecklist = this.transportPlugin.generateChecklist(
                selectedRouteDirection,
                undefined, // itinerary draft 将在计划生成后更新
                undefined, // availableModes 可以从外部系统获取
                (state.context as any).transportBookingStatus // 用户交通预订状态
              );

              // 如果有不可用的交通模式，触发 Neptune 修复
              if (transportChecklist.summary.unavailableModes && 
                  transportChecklist.summary.unavailableModes.length > 0) {
                this.logger.warn(
                  `交通模式不可用: ${transportChecklist.summary.unavailableModes.join(', ')}，将触发 Neptune 修复`
                );
                // 将交通修复动作存储到 state 中，供 Neptune 使用
                (state as any).transportNeptuneActions = transportChecklist.neptuneActions;
              }

              // 将交通检查清单存储到 state 中
              (state as any).transportChecklist = transportChecklist;
            } catch (error) {
              this.logger.warn(`交通模式检查失败: ${error}`);
            }
          }

          // 根据路线方向生成候选 POI
          if (this.routeDirectionPoiGenerator) {
            const poiPoolQueryStartTime = Date.now();
            const routePois = await this.routeDirectionPoiGenerator.generateCandidatePois(
              selectedRouteDirection,
              selectedRouteDirection.routeDirection.regions
            );
            
            if (this.observabilityService) {
              this.observabilityService.recordPoiPoolQueryLatency(
                traceRequestId,
                Date.now() - poiPoolQueryStartTime
              );
              
              // 记录 POI pool 过滤
              const afterRdFilterSize = Object.values(state.candidatesByDate).reduce(
                (sum, candidates) => sum + candidates.length,
                0
              );
              this.observabilityService.recordPoiPoolSize(traceRequestId, afterRdFilterSize, 'afterRdFilter');
            }

            // 将路线方向的 POI 添加到候选池
            this.mergeCandidatePois(state, routePois);
            
            if (this.observabilityService) {
              const afterMergeSize = Object.values(state.candidatesByDate).reduce(
                (sum, candidates) => sum + candidates.length,
                0
              );
              this.observabilityService.recordPoiPoolSize(traceRequestId, afterMergeSize, 'afterConstraints');
            }
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
    
    // 根据 pace 调整日程时间窗口和缓冲时间
    const pace = state.context.preferences.pace || 'moderate';
    const paceMultiplier = this.getPaceMultiplier(pace);
    
    // relaxed: 更晚开始，更早结束，更多缓冲
    // intense: 更早开始，更晚结束，更少缓冲
    const dayStart = pace === 'relaxed' 
      ? '09:00' 
      : pace === 'intense'
        ? '07:00'
        : (state.policies?.dayStart ?? '08:30');
    const dayEnd = pace === 'relaxed'
      ? '19:00'
      : pace === 'intense'
        ? '22:00'
        : (state.policies?.dayEnd ?? '20:30');
    const buffer = Math.round((state.policies?.bufferMinBetweenActivities ?? 10) * paceMultiplier.buffer);

    const days: TripPlan['days'] = [];

    for (let i = 0; i < state.context.durationDays; i++) {
      const date = addDays(state.context.startDate, i);
      const pool = state.candidatesByDate[date] || [];

      // Abu: choose what to keep under daily limits (rough by pace)
      // 根据 pace 和策略配置调整每日活动时间限制
      const policyProfile = getPolicyProfile(pace);
      
      // 基础时间限制
      let maxActiveMin =
        pace === 'relaxed'
          ? 240
          : pace === 'intense'
            ? 420
            : 330;
      
      // 根据策略配置微调（考虑 abuConfig 的影响）
      // relaxed 时更保守，intense 时更激进
      if (pace === 'relaxed') {
        maxActiveMin = Math.round(maxActiveMin * 0.9); // 再降低 10%
      } else if (pace === 'intense') {
        maxActiveMin = Math.round(maxActiveMin * 1.1); // 再提高 10%
      }

      // 如果存在合规降级选项，调整候选池（降级为城市/轻线）
      let adjustedPool = pool;
      if ((state as any).complianceDowngrade) {
        // 过滤掉需要许可/向导的 POI，只保留城市/轻线 POI
        adjustedPool = this.filterPoolForComplianceDowngrade(pool);
        this.logger.log(`合规降级：从 ${pool.length} 个候选 POI 过滤到 ${adjustedPool.length} 个`);
      }

      const abu = abuSelectCoreActivities(state, date, adjustedPool, {
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

      // 计算简化的 terrainFacts（从 RouteDirection 约束或候选 POI 中提取）
      const terrainFacts = this.computeDayTerrainFacts(
        selectedRouteDirection,
        abu.kept,
        slots
      );

      // DEM驱动的每日体力预算计算（如果启用）
      let dailyEnergyBudget = undefined;
      if (this.demDailyEnergyService && slots.length > 0) {
        try {
          const dayPlan: PlanDay = {
            day: i + 1,
            date,
            timeSlots: slots,
            terrainFacts,
          };
          dailyEnergyBudget = await this.demDailyEnergyService.calculateDynamicDailyBudget(
            dayPlan,
            selectedRouteDirection?.routeDirection,
            pace
          );

          // 如果体力预算超限，记录警告
          if (dailyEnergyBudget.totalEnergyCost > dailyEnergyBudget.maxEnergyCost) {
            this.logger.warn(
              `Day ${i + 1} 体力预算超限: 消耗 ${dailyEnergyBudget.totalEnergyCost.toFixed(1)}, 预算 ${dailyEnergyBudget.maxEnergyCost}`
            );
          }

          // 将体力预算信息添加到terrainFacts
          if (terrainFacts) {
            terrainFacts.effortLevel = this.inferEffortLevel(dailyEnergyBudget);
          }
        } catch (error) {
          this.logger.warn(`Day ${i + 1} DEM体力预算计算失败: ${error}`);
        }
      }

      days.push({ 
        day: i + 1, 
        date, 
        timeSlots: slots,
        terrainFacts,
      });
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
      // 记录 RouteDirection 选择信息
      routeDirection: selectedRouteDirection
        ? {
            selected: {
              id: selectedRouteDirection.routeDirection.id,
              uuid: selectedRouteDirection.routeDirection.uuid,
              name: selectedRouteDirection.routeDirection.name,
              nameCN: selectedRouteDirection.routeDirection.nameCN,
            },
            scoreBreakdown: selectedRouteDirection.scoreBreakdown,
            constraints: selectedRouteDirection.constraints,
            matchedSignals: selectedRouteDirection.matchedSignals,
          }
        : undefined,
    };

    // 记录观测指标
    if (this.observabilityService) {
      const planGenerateLatency = Date.now() - planGenerateStartTime;
      this.observabilityService.recordPlanGenerateLatency(traceRequestId, planGenerateLatency);
      
      // 记录最终 POI pool 大小
      const finalPoolSize = Object.values(state.candidatesByDate).reduce(
        (sum, candidates) => sum + candidates.length,
        0
      );
      this.observabilityService.recordPoiPoolSize(traceRequestId, finalPoolSize, 'final');
      
      // 记录约束命中次数
      const hardConstraintsHit = log.violations?.filter(v => v.code.includes('HARD')).length || 0;
      const softConstraintsHit = log.violations?.filter(v => v.code.includes('SOFT')).length || 0;
      if (hardConstraintsHit > 0) {
        this.observabilityService.recordHardConstraintsHit(traceRequestId, hardConstraintsHit);
      }
      if (softConstraintsHit > 0) {
        this.observabilityService.recordSoftConstraintsHit(traceRequestId, softConstraintsHit);
      }
      
      // 记录修复动作次数
      const repairActionCount = log.chosenActions?.length || 0;
      if (repairActionCount > 0) {
        this.observabilityService.recordRepairActionCount(traceRequestId, repairActionCount);
      }
      
      // 完成 trace
      this.observabilityService.completeTrace(traceRequestId);
    }

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
   * 根据 pace 调整约束值，并应用目标权重
   */
  private injectConstraints(state: TripWorldState, constraints: any): void {
    // 将约束存储到 state 的 metadata 中，供后续策略使用
    if (!state.policies) {
      state.policies = {};
    }

    const policies = state.policies as any;

    // 获取 pace 偏好
    const pace = state.context.preferences.pace || 'moderate';
    
    // 获取策略配置（根据 pace）
    const policyProfile = getPolicyProfile(pace);
    
    // 应用策略配置到 policies
    policies.objectiveWeights = policyProfile.objectiveWeights;
    policies.abuConfig = policyProfile.abuConfig;
    policies.drdreConfig = policyProfile.drdreConfig;

    // 解析约束结构（支持新格式和旧格式兼容）
    const hardConstraints = constraints.hard || {};
    const softConstraints = constraints.soft || {};
    const objectives = constraints.objectives || {};

    // 根据 pace 调整约束值
    const paceMultiplier = this.getPaceMultiplier(pace);

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
    // 根据 pace 调整约束值
    if (softConstraints.maxDailyAscentM !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      // relaxed: 降低 30%, moderate: 不变, intense: 提高 20%
      policies.softConstraints.maxDailyAscentM = Math.round(
        softConstraints.maxDailyAscentM * paceMultiplier.ascent
      );
    }
    if (softConstraints.maxElevationM !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      // relaxed: 降低 20%, moderate: 不变, intense: 提高 10%
      policies.softConstraints.maxElevationM = Math.round(
        softConstraints.maxElevationM * paceMultiplier.elevation
      );
    }
    if (softConstraints.bufferTimeMin !== undefined) {
      policies.softConstraints = policies.softConstraints || {};
      // relaxed: 增加缓冲时间 50%, moderate: 不变, intense: 减少缓冲时间 30%
      policies.softConstraints.bufferTimeMin = Math.round(
        softConstraints.bufferTimeMin * paceMultiplier.buffer
      );
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
        policies.softConstraints.maxElevationM = Math.round(
          constraints.maxElevationM * paceMultiplier.elevation
        );
      }
      if (constraints.maxDailyAscentM) {
        policies.softConstraints = policies.softConstraints || {};
        policies.softConstraints.maxDailyAscentM = Math.round(
          constraints.maxDailyAscentM * paceMultiplier.ascent
        );
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
      `注入了约束 (pace=${pace}): hard=${JSON.stringify(policies.hardConstraints)}, soft=${JSON.stringify(policies.softConstraints)}, objectives=${JSON.stringify(policies.objectives)}`
    );
  }

  /**
   * 根据 pace 获取约束调整倍数
   */
  private getPaceMultiplier(pace: 'relaxed' | 'moderate' | 'intense'): {
    ascent: number;      // 爬升倍数
    elevation: number;   // 海拔倍数
    buffer: number;     // 缓冲时间倍数
  } {
    switch (pace) {
      case 'relaxed':
        return {
          ascent: 0.7,      // 降低 30%
          elevation: 0.8,   // 降低 20%
          buffer: 1.5,      // 增加 50%
        };
      case 'intense':
        return {
          ascent: 1.2,      // 提高 20%
          elevation: 1.1,   // 提高 10%
          buffer: 0.7,      // 减少 30%
        };
      case 'moderate':
      default:
        return {
          ascent: 1.0,
          elevation: 1.0,
          buffer: 1.0,
        };
    }
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

  /**
   * 计算一天的 terrainFacts（简化版，用于 E2E 测试）
   */
  private computeDayTerrainFacts(
    selectedRouteDirection: any,
    keptActivities: ActivityCandidate[],
    slots: PlanSlot[]
  ): PlanDay['terrainFacts'] {
    // 从 RouteDirection 约束中提取
    const constraints = selectedRouteDirection?.constraints || selectedRouteDirection?.routeDirection?.constraints;
    const maxElevation = constraints?.maxElevationM || constraints?.soft?.maxElevationM || constraints?.hard?.maxElevationM;
    const maxDailyAscent = constraints?.maxDailyAscentM || constraints?.soft?.maxDailyAscentM;

    // 从候选 POI 中提取海拔信息（如果有）
    let minElevation: number | undefined;
    let maxElevationFromPois: number | undefined;
    
    for (const activity of keptActivities) {
      // 假设 POI 的 metadata 中包含海拔信息
      const elevation = (activity as any).metadata?.elevationM || (activity as any).metadata?.altitudeM;
      if (elevation !== undefined) {
        if (minElevation === undefined || elevation < minElevation) {
          minElevation = elevation;
        }
        if (maxElevationFromPois === undefined || elevation > maxElevationFromPois) {
          maxElevationFromPois = elevation;
        }
      }
    }

    // 使用 RouteDirection 的 maxElevation 或从 POI 中提取的
    const finalMaxElevation = maxElevation || maxElevationFromPois;

    // 计算简化的 totalAscent（基于 maxElevation 和 minElevation 的差值，或使用约束值）
    let totalAscent: number | undefined;
    if (maxDailyAscent) {
      totalAscent = maxDailyAscent;
    } else if (finalMaxElevation && minElevation) {
      totalAscent = finalMaxElevation - minElevation;
    }

    // 确定 effortLevel（基于约束或默认值）
    let effortLevel: 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME' | undefined;
    if (maxDailyAscent && maxDailyAscent > 1000) {
      effortLevel = 'CHALLENGE';
    } else if (maxDailyAscent && maxDailyAscent > 500) {
      effortLevel = 'MODERATE';
    } else if (maxDailyAscent && maxDailyAscent <= 500) {
      effortLevel = 'RELAX';
    }

    // 生成风险标志（基于约束）
    const riskFlags: Array<{ type: string; severity: 'LOW' | 'MEDIUM' | 'HIGH'; message: string }> = [];
    if (finalMaxElevation && finalMaxElevation > 3500) {
      riskFlags.push({
        type: 'HIGH_ALTITUDE',
        severity: 'HIGH',
        message: `最高海拔 ${finalMaxElevation}m，存在高反风险`,
      });
    }
    if (maxDailyAscent && maxDailyAscent > 500) {
      riskFlags.push({
        type: 'RAPID_ASCENT',
        severity: maxDailyAscent > 1000 ? 'HIGH' : 'MEDIUM',
        message: `每日爬升 ${maxDailyAscent}m，需注意适应`,
      });
    }

    if (!finalMaxElevation && !totalAscent) {
      // 如果没有足够信息，返回 undefined（测试中会检查）
      return undefined;
    }

    return {
      maxElevation: finalMaxElevation,
      totalAscent,
      minElevation,
      effortLevel,
      riskFlags: riskFlags.length > 0 ? riskFlags : undefined,
    };
  }
}

  /**
   * 为合规降级过滤候选 POI 池
   * 移除需要许可/向导的 POI，只保留城市/轻线 POI
   */
  private filterPoolForComplianceDowngrade(pool: ActivityCandidate[]): ActivityCandidate[] {
    return pool.filter(candidate => {
      // 过滤掉高海拔、徒步、限制区域等类型的 POI
      const tags = candidate.intentTags || [];
      const category = candidate.category || '';

      // 保留城市、文化、轻松类型的 POI
      const keepTags = ['城市', '文化', '博物馆', '餐厅', '购物', 'city', 'culture', 'museum', 'restaurant'];
      const excludeTags = ['徒步', '登山', '高海拔', '限制区域', 'hiking', 'mountaineering', 'high_altitude'];

      const hasKeepTag = keepTags.some(tag => 
        tags.includes(tag) || category.toLowerCase().includes(tag.toLowerCase())
      );
      const hasExcludeTag = excludeTags.some(tag => 
        tags.includes(tag) || category.toLowerCase().includes(tag.toLowerCase())
      );

      // 如果有保留标签且没有排除标签，则保留
      return hasKeepTag && !hasExcludeTag;
    });
  }
}

// minimal date helper (local date math: YYYY-MM-DD)
function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

