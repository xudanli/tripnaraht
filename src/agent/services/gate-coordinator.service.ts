/**
 * Gate分层架构
 *
 * 三层Gate设计：
 * 1. Hard Rule Gate - 签证、天气、F-road、2WD、营业时间（非LLM）
 * 2. Config Gate - 目的地策略、车型、季节规则（非LLM）
 * 3. Semantic Gate - 用户意图模糊、偏好冲突（LLM，兜底）
 */

import { Injectable, Logger } from '@nestjs/common';
import type { TripPlanRequest } from '../interfaces/trip-plan.interface';

export interface GateResult {
  passed: boolean;
  blocker?: {
    type: 'hard' | 'config' | 'semantic';
    code: string;
    message: string;
    severity: 'critical' | 'warning' | 'info';
    suggestedAction?: string;
  };
  metadata?: Record<string, any>;
}

export interface GateCheckResult {
  hasCriticalBlocker: boolean;
  results: GateResult[];
  needsSemanticJudgement: boolean;
}

@Injectable()
export class RuleGateService {
  private readonly logger = new Logger(RuleGateService.name);

  /**
   * Hard Rule Gate检查
   * 纯规则检查，不涉及LLM
   */
  async check(request: TripPlanRequest): Promise<GateResult[]> {
    const results: GateResult[] = [];

    // 1. 签证检查
    const visaResult = this.checkVisa(request);
    if (visaResult) results.push(visaResult);

    // 2. 天气检查
    const weatherResult = this.checkWeather(request);
    if (weatherResult) results.push(weatherResult);

    // 3. F-road检查（冰岛）
    const froadResult = this.checkFRoad(request);
    if (froadResult) results.push(froadResult);

    // 4. 2WD限制检查
    const vehicleResult = this.checkVehicle(request);
    if (vehicleResult) results.push(vehicleResult);

    // 5. 营业时间检查
    const hoursResult = this.checkOpeningHours(request);
    if (hoursResult) results.push(hoursResult);

    return results;
  }

  private checkVisa(request: TripPlanRequest): GateResult | null {
    // 简化版：检查目的地是否需要签证
    const visaRequiredCountries = ['US', 'RU', 'CN'];
    const dest = typeof request.destination === 'string' ? request.destination : '';
    if (visaRequiredCountries.includes(dest)) {
      return {
        passed: false,
        blocker: {
          type: 'hard',
          code: 'VISA_REQUIRED',
          message: `${dest} 需要签证`,
          severity: 'critical',
          suggestedAction: '请确认您已持有有效签证',
        },
      };
    }
    return null;
  }

  private checkWeather(request: TripPlanRequest): GateResult | null {
    // 简化版：检查季节性天气限制
    const seasonalRestrictions: Record<string, { months: number[]; message: string }> = {
      IS: {
        months: [11, 12, 1, 2, 3], // 冬季
        message: '冰岛冬季部分道路关闭，建议调整行程',
      },
    };

    const dest = typeof request.destination === 'string' ? request.destination : '';
    const restriction = seasonalRestrictions[dest];
    if (restriction) {
      const currentMonth = new Date().getMonth() + 1;
      if (restriction.months.includes(currentMonth)) {
        return {
          passed: false,
          blocker: {
            type: 'hard',
            code: 'SEASONAL_RESTRICTION',
            message: restriction.message,
            severity: 'warning',
            suggestedAction: '建议调整出行时间或接受部分景点关闭',
          },
        };
      }
    }
    return null;
  }

  private checkFRoad(request: TripPlanRequest): GateResult | null {
    // 冰岛F-road检查
    const dest = typeof request.destination === 'string' ? request.destination : '';
    if (dest === 'IS' && request.constraints?.vehicle_type !== '4WD') {
      return {
        passed: false,
        blocker: {
          type: 'hard',
          code: 'FROAD_REQUIRES_4WD',
          message: '冰岛部分景点需要通过F-road，建议使用4WD车辆',
          severity: 'warning',
          suggestedAction: '升级为4WD车辆或调整行程避开F-road',
        },
      };
    }
    return null;
  }

  private checkVehicle(request: TripPlanRequest): GateResult | null {
    // 2WD限制检查
    const dest = typeof request.destination === 'string' ? request.destination : '';
    if (request.constraints?.vehicle_type === '2WD' && dest === 'IS') {
      return {
        passed: false,
        blocker: {
          type: 'hard',
          code: '2WD_LIMITATION',
          message: '2WD车辆在冰岛部分区域受限',
          severity: 'warning',
          suggestedAction: '建议升级为4WD或调整行程',
        },
      };
    }
    return null;
  }

  private checkOpeningHours(request: TripPlanRequest): GateResult | null {
    // 营业时间检查（简化版）
    // 实际应该检查具体POI的营业时间
    return null;
  }
}

@Injectable()
export class ConfigGateService {
  private readonly logger = new Logger(ConfigGateService.name);

  /**
   * Config Gate检查
   * 基于目的地配置的策略检查，不涉及LLM
   */
  async check(request: TripPlanRequest): Promise<GateResult[]> {
    const results: GateResult[] = [];

    // 1. 目的地策略检查
    const strategyResult = this.checkDestinationStrategy(request);
    if (strategyResult) results.push(strategyResult);

    // 2. 车型策略检查
    const vehicleStrategyResult = this.checkVehicleStrategy(request);
    if (vehicleStrategyResult) results.push(vehicleStrategyResult);

    // 3. 季节策略检查
    const seasonStrategyResult = this.checkSeasonStrategy(request);
    if (seasonStrategyResult) results.push(seasonStrategyResult);

    return results;
  }

  private checkDestinationStrategy(request: TripPlanRequest): GateResult | null {
    // 目的地特定策略
    const strategies: Record<string, { minDays: number; maxDays: number; message: string }> = {
      IS: { minDays: 3, maxDays: 14, message: '冰岛建议3-14天' },
      JP: { minDays: 5, maxDays: 21, message: '日本建议5-21天' },
    };

    const dest = typeof request.destination === 'string' ? request.destination : '';
    const strategy = strategies[dest];
    if (strategy) {
      const days = request.days || 7;
      if (days < strategy.minDays || days > strategy.maxDays) {
        return {
          passed: false,
          blocker: {
            type: 'config',
            code: 'DAYS_OUT_OF_RANGE',
            message: strategy.message,
            severity: 'warning',
            suggestedAction: `建议调整为${strategy.minDays}-${strategy.maxDays}天`,
          },
        };
      }
    }
    return null;
  }

  private checkVehicleStrategy(request: TripPlanRequest): GateResult | null {
    // 车型策略检查
    return null;
  }

  private checkSeasonStrategy(request: TripPlanRequest): GateResult | null {
    // 季节策略检查
    return null;
  }
}

@Injectable()
export class SemanticGateService {
  private readonly logger = new Logger(SemanticGateService.name);

  /**
   * Semantic Gate检查
   * 仅在需要语义判断时使用LLM，作为兜底
   */
  async check(request: TripPlanRequest): Promise<GateResult[]> {
    // 这里应该调用LLM进行语义判断
    // 但作为兜底，只在必要时调用
    return [];
  }

  /**
   * 判断是否需要语义判断
   */
  needsSemanticJudgement(request: TripPlanRequest): boolean {
    // 简化版：只有当用户输入非常模糊时才需要语义判断
    const dest = typeof request.destination === 'string' ? request.destination : '';
    const isVague = !dest || !request.days;
    return isVague;
  }
}

@Injectable()
export class GateCoordinatorService {
  private readonly logger = new Logger(GateCoordinatorService.name);

  constructor(
    private readonly ruleGate: RuleGateService,
    private readonly configGate: ConfigGateService,
    private readonly semanticGate: SemanticGateService,
  ) {}

  /**
   * Gate协调器：按顺序执行三层Gate
   */
  async executeGateCheck(request: TripPlanRequest): Promise<GateCheckResult> {
    const startTime = Date.now();

    // 1. 并行执行 Rule Gate 和 Config Gate（非LLM，快速）
    const [ruleResults, configResults] = await Promise.all([
      this.ruleGate.check(request),
      this.configGate.check(request),
    ]);

    // 2. 检查是否有Critical Blocker
    const allResults = [...ruleResults, ...configResults];
    const hasCriticalBlocker = allResults.some(
      r => !r.passed && r.blocker?.severity === 'critical'
    );

    if (hasCriticalBlocker) {
      this.logger.log(`Gate检查发现Critical Blocker，耗时${Date.now() - startTime}ms`);
      return {
        hasCriticalBlocker: true,
        results: allResults,
        needsSemanticJudgement: false,
      };
    }

    // 3. 判断是否需要语义判断
    const needsSemantic = this.semanticGate.needsSemanticJudgement(request);

    let semanticResults: GateResult[] = [];
    if (needsSemantic) {
      // 4. 只有必要时才执行 Semantic Gate（LLM）
      this.logger.log('需要语义判断，执行Semantic Gate');
      semanticResults = await this.semanticGate.check(request);
    }

    const finalResults = [...allResults, ...semanticResults];
    this.logger.log(`Gate检查完成，总耗时${Date.now() - startTime}ms`);

    return {
      hasCriticalBlocker: false,
      results: finalResults,
      needsSemanticJudgement: needsSemantic,
    };
  }
}
