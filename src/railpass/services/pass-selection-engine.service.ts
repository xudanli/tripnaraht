// src/railpass/services/pass-selection-engine.service.ts

/**
 * Pass 产品决策引擎 (Pass Selection Engine)
 * 
 * 根据预期 rail 段数、跨国数量、是否每天都坐火车、停留模式、预算敏感度
 * 推荐 Global/OneCountry + Flexi/Continuous + class + mobile/paper
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  PassType,
  ValidityType,
  PassClass,
  PassMedium,
  PassRecommendation,
  RailSegment,
  ISODate,
} from '../interfaces/railpass.interface';
import { TravelDayCalculationEngineService } from './travel-day-calculation-engine.service';

interface PassSelectionInput {
  /** 预期 rail 段数 */
  estimatedRailSegments: number;
  
  /** 跨国数量 */
  crossCountryCount: number;
  
  /** 是否每天都坐火车 */
  isDailyTravel: boolean;
  
  /** 停留模式：跳城（快速移动） vs 驻留（在一个城市待多天） */
  stayMode: 'city_hopping' | 'stay_extended';
  
  /** 预算敏感度 */
  budgetSensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  
  /** 旅行天数 */
  tripDurationDays: number;
  
  /** 旅行日期范围 */
  tripDateRange: {
    start: ISODate;
    end: ISODate;
  };
  
  /** 居住国代码 */
  residencyCountry: string;
  
  /** Pass Family（已通过合规引擎确定） */
  passFamily: 'EURAIL' | 'INTERRAIL';
  
  /** 用户偏好 */
  preferences?: {
    preferFlexibility?: boolean; // 是否偏好灵活
    preferMobile?: boolean;      // 是否偏好手机票
    preferFirstClass?: boolean;  // 是否偏好一等座
  };
}

@Injectable()
export class PassSelectionEngineService {
  private readonly logger = new Logger(PassSelectionEngineService.name);

  constructor(
    private readonly travelDayCalculator: TravelDayCalculationEngineService,
  ) {}

  /**
   * 推荐 Pass 配置
   */
  async recommendPass(
    input: PassSelectionInput,
    sampleSegments?: RailSegment[] // 用于模拟 Travel Day 消耗
  ): Promise<PassRecommendation> {
    // 1. 确定 Pass Type（Global vs OneCountry）
    const passType = this.determinePassType(input);

    // 2. 确定 Validity Type（Flexi vs Continuous）
    const validityType = this.determineValidityType(input);

    // 3. 确定 Travel Days（如果是 Flexi）
    const travelDaysTotal = validityType === 'FLEXI' 
      ? this.estimateTravelDays(input, sampleSegments)
      : undefined;

    // 4. 确定 Class（First vs Second）
    const passClass = this.determineClass(input);

    // 5. 确定 Medium（Mobile vs Paper）
    const medium = this.determineMedium(input);

    // 构建推荐配置
    const recommendedProfile: RailPassProfile = {
      residencyCountry: input.residencyCountry,
      passFamily: input.passFamily,
      passType,
      validityType,
      travelDaysTotal,
      homeCountryOutboundUsed: 0,
      homeCountryInboundUsed: 0,
      class: passClass,
      mobileOrPaper: medium,
      validityStartDate: input.tripDateRange.start,
      validityEndDate: input.tripDateRange.end,
    };

    // 如果提供了样本 segments，模拟 Travel Day 消耗
    let travelDaySimulation: { estimatedDaysUsed: number; daysByDate: Record<string, { consumed: boolean; segments: string[]; }>; } | undefined;
    if (sampleSegments && validityType === 'FLEXI' && travelDaysTotal) {
      const result = this.travelDayCalculator.calculateTravelDays({
        segments: sampleSegments,
        passProfile: recommendedProfile,
      });
      travelDaySimulation = {
        estimatedDaysUsed: result.totalDaysUsed,
        daysByDate: result.daysByDate,
      };
    }

    // 生成说明
    const explanation = this.generateExplanation({
      profile: recommendedProfile,
      input,
      travelDaySimulation,
    });

    return {
      recommendedProfile,
      explanation,
      travelDaySimulation,
    };
  }

  /**
   * 确定 Pass Type
   * 
   * 规则：
   * - 如果跨国数量 >= 2 → Global
   * - 如果跨国数量 = 1 或 0 → OneCountry（但如果只在一个国家，可能需要考虑是否值得买 Pass）
   */
  private determinePassType(input: PassSelectionInput): PassType {
    if (input.crossCountryCount >= 2) {
      return 'GLOBAL';
    }
    
    // 单国或多国但只跨一次边界
    return 'ONE_COUNTRY';
  }

  /**
   * 确定 Validity Type
   * 
   * 规则：
   * - 如果每天都坐火车 → Continuous
   * - 如果是驻留模式（在一个城市待多天） → Flexi
   * - 如果用户偏好灵活性 → Flexi
   * - 否则根据停留模式判断
   */
  private determineValidityType(input: PassSelectionInput): ValidityType {
    if (input.isDailyTravel) {
      return 'CONTINUOUS';
    }

    if (input.preferences?.preferFlexibility) {
      return 'FLEXI';
    }

    if (input.stayMode === 'stay_extended') {
      return 'FLEXI';
    }

    // 默认：跳城模式可能更适合 Continuous，但如果间隔较大则用 Flexi
    // 这里简化处理：如果不是每天都有火车，用 Flexi
    return 'FLEXI';
  }

  /**
   * 估算 Travel Days（Flexi）
   * 
   * 根据预期段数和停留模式估算需要的 Travel Days
   */
  private estimateTravelDays(
    input: PassSelectionInput,
    sampleSegments?: RailSegment[]
  ): number {
    // 如果有样本 segments，使用实际计算
    if (sampleSegments && sampleSegments.length > 0) {
      // 简化：每个 segment 平均消耗 1 个 travel day
      // 夜车可能消耗 2 个（如果跨午夜）
      let estimated = 0;
      for (const seg of sampleSegments) {
        if (seg.isNightTrain && seg.crossesMidnight) {
          estimated += 2;
        } else {
          estimated += 1;
        }
      }
      // 向上取整到最接近的 5 天（常见 Pass 选项：5, 7, 10, 15 天）
      return Math.ceil(estimated / 5) * 5;
    }

    // 否则基于预期段数估算
    // 粗略估计：每 2-3 段消耗 1 个 travel day（考虑到跳城模式可能一天多段）
    const baseEstimate = Math.ceil(input.estimatedRailSegments / 2.5);
    
    // 向上取整到最接近的 5 天
    return Math.max(5, Math.ceil(baseEstimate / 5) * 5);
  }

  /**
   * 确定 Class
   * 
   * 规则：
   * - 如果用户偏好一等座 → First
   * - 如果预算敏感度高 → Second
   * - 默认 → Second
   */
  private determineClass(input: PassSelectionInput): PassClass {
    if (input.preferences?.preferFirstClass) {
      return 'FIRST';
    }

    if (input.budgetSensitivity === 'HIGH') {
      return 'SECOND';
    }

    // 默认 Second
    return 'SECOND';
  }

  /**
   * 确定 Medium
   * 
   * 规则：
   * - 如果用户偏好手机票 → Mobile
   * - 默认推荐 Mobile（更方便，但需要注意 24 小时联网要求）
   * - 如果用户没有智能手机或偏好纸质票 → Paper
   */
  private determineMedium(input: PassSelectionInput): PassMedium {
    if (input.preferences?.preferMobile === false) {
      return 'PAPER';
    }

    // 默认推荐 Mobile（更现代、方便）
    // 但需要提醒用户：Mobile Pass 需要每 24 小时联网一次
    return 'MOBILE';
  }

  /**
   * 生成推荐说明
   */
  private generateExplanation(args: {
    profile: RailPassProfile;
    input: PassSelectionInput;
    travelDaySimulation?: any;
  }): string {
    const { profile, input, travelDaySimulation } = args;
    const parts: string[] = [];

    parts.push(`推荐 ${profile.passFamily} ${profile.passType} Pass`);
    
    if (profile.validityType === 'FLEXI') {
      parts.push(`${profile.travelDaysTotal} 天 Flexi Pass`);
      if (travelDaySimulation) {
        parts.push(`（预计消耗 ${travelDaySimulation.totalDaysUsed} 天，剩余 ${travelDaySimulation.remainingDays} 天）`);
      }
    } else {
      parts.push('Continuous Pass');
    }

    parts.push(`${profile.class === 'FIRST' ? '一等座' : '二等座'}`);
    parts.push(`${profile.mobileOrPaper === 'MOBILE' ? '手机票' : '纸质票'}`);

    if (profile.mobileOrPaper === 'MOBILE') {
      parts.push('（注意：Mobile Pass 需要每 24 小时联网一次，否则会变为 inactive）');
    }

    return parts.join('，');
  }
}
