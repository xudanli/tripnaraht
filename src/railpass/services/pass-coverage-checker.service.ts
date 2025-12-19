// src/railpass/services/pass-coverage-checker.service.ts

/**
 * Pass 覆盖校验服务
 * 
 * 检查 rail segment 是否在 Pass 覆盖范围内
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  RailPassProfile,
  RailSegment,
} from '../interfaces/railpass.interface';

/**
 * 运营商覆盖状态
 */
export type CoverageStatus = 
  | 'COVERED'      // 完全覆盖
  | 'NOT_COVERED'  // 不覆盖
  | 'PARTIAL'      // 部分覆盖（某些线路覆盖，某些不覆盖）
  | 'UNKNOWN';     // 未知（需要进一步查询）

/**
 * 覆盖检查结果
 */
export interface CoverageCheckResult {
  /** 是否覆盖 */
  covered: boolean;
  
  /** 覆盖状态 */
  status: CoverageStatus;
  
  /** 说明 */
  explanation: string;
  
  /** 是否包含市内交通 */
  includesCityTransport: boolean;
  
  /** 替代方案建议 */
  alternatives?: Array<{
    type: 'METRO' | 'BUS' | 'TAXI' | 'WALK';
    description: string;
    estimatedCost?: number;
    estimatedTimeMinutes?: number;
  }>;
}

/**
 * 已知的覆盖运营商列表（部分）
 * 实际应该从数据库或配置文件加载
 */
const COVERED_OPERATORS = new Set([
  'SNCF',      // 法国
  'DB',        // 德国
  'ÖBB',       // 奥地利
  'SBB',       // 瑞士
  'Trenitalia', // 意大利
  'Renfe',     // 西班牙
  'NS',        // 荷兰
  'SNCB',      // 比利时
  'CP',        // 葡萄牙
  'Eurostar',  // 欧洲之星
  'Thalys',    // 塔利斯
  'TGV',       // TGV
  'ICE',       // ICE
]);

/**
 * 通常不覆盖的运营商类型
 */
const USUALLY_NOT_COVERED = new Set([
  'METRO',     // 地铁
  'TRAM',      // 有轨电车
  'CITY_BUS',  // 市内公交
  'PRIVATE_RAIL', // 私有铁路（某些）
]);

@Injectable()
export class PassCoverageCheckerService {
  private readonly logger = new Logger(PassCoverageCheckerService.name);

  /**
   * 检查 segment 是否在 Pass 覆盖范围内
   */
  checkCoverage(
    segment: RailSegment,
    passProfile: RailPassProfile
  ): CoverageCheckResult {
    // One Country Pass：只覆盖指定国家
    if (passProfile.passType === 'ONE_COUNTRY') {
      // 需要知道 Pass 覆盖哪个国家（这里简化处理）
      const covered = segment.fromCountryCode === segment.toCountryCode;
      return {
        covered,
        status: covered ? 'COVERED' : 'NOT_COVERED',
        explanation: covered 
          ? 'One Country Pass 覆盖该国境内的铁路线路'
          : 'One Country Pass 仅覆盖指定国家，不覆盖跨国线路',
        includesCityTransport: false,
      };
    }

    // Global Pass：检查运营商和线路类型
    return this.checkGlobalPassCoverage(segment, passProfile);
  }

  /**
   * 检查 Global Pass 覆盖
   */
  private checkGlobalPassCoverage(
    segment: RailSegment,
    passProfile: RailPassProfile
  ): CoverageCheckResult {
    // 0. One Country Pass：检查是否跨境（不能用于跨境段）
    if (passProfile.passType === 'ONE_COUNTRY') {
      const isCrossBorder = segment.fromCountryCode !== segment.toCountryCode;
      if (isCrossBorder) {
        return {
          covered: false,
          status: 'NOT_COVERED',
          explanation: 'One Country Pass 仅限该国境内网络，不能用于跨境段。需要额外购买点对点票或升级为 Global Pass',
          includesCityTransport: false,
          alternatives: [
            {
              type: 'METRO',
              description: '在边境站下车，换乘其他交通方式',
            },
            {
              type: 'TAXI',
              description: '购买跨境段的单独车票',
            },
          ],
        };
      }
      // One Country Pass 境内段继续后续检查
    }

    // 1. 检查是否是市内交通（通常不覆盖）
    // 这里简化处理，实际应该根据运营商类型判断
    const isCityTransport = this.isCityTransport(segment);

    if (isCityTransport) {
      return {
        covered: false,
        status: 'NOT_COVERED',
        explanation: 'Pass 一般只覆盖火车（trains），城市地铁/公交/有轨电车（trams/buses/metros）不包含（可能有少数合作折扣，但不保证）',
        includesCityTransport: false,
        alternatives: this.generateCityTransportAlternatives(segment),
      };
    }

    // 2. 检查是否是覆盖的运营商
    // 简化：假设所有国际/高铁/夜车都是覆盖的运营商
    if (segment.isInternational || segment.isHighSpeed || segment.isNightTrain) {
      // 这些通常是覆盖的
      // 但需要进一步检查具体的运营商
      const operatorCovered = this.checkOperatorCoverage(segment);

      if (operatorCovered) {
        return {
          covered: true,
          status: 'COVERED',
          explanation: '该线路在 Global Pass 覆盖范围内',
          includesCityTransport: false,
        };
      }
    }

    // 3. 默认：需要进一步查询（UNKNOWN）
    // 实际应该查询覆盖数据库
    return {
      covered: true, // 暂时假设覆盖，实际应该查询
      status: 'UNKNOWN',
      explanation: '需要进一步查询该线路是否在 Pass 覆盖范围内，建议咨询官方或查看 Rail Planner',
      includesCityTransport: false,
    };
  }

  /**
   * 检查是否是市内交通
   */
  private isCityTransport(segment: RailSegment): boolean {
    // 简化判断：如果距离很短（< 50km）且在同一城市，可能是市内交通
    // 实际应该根据运营商类型和线路特征判断
    
    // 如果有 operatorHint，可以根据它判断
    if (segment.operatorHint) {
      const operator = segment.operatorHint.toUpperCase();
      for (const notCovered of USUALLY_NOT_COVERED) {
        if (operator.includes(notCovered)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 检查运营商覆盖
   */
  private checkOperatorCoverage(segment: RailSegment): boolean {
    if (!segment.operatorHint) {
      return true; // 未知运营商，默认假设覆盖
    }

    const operator = segment.operatorHint.toUpperCase();
    for (const coveredOp of COVERED_OPERATORS) {
      if (operator.includes(coveredOp)) {
        return true;
      }
    }

    return false; // 不在已知覆盖列表，需要进一步查询
  }

  /**
   * 生成市内交通替代方案
   */
  private generateCityTransportAlternatives(
    segment: RailSegment
  ): CoverageCheckResult['alternatives'] {
    return [
      {
        type: 'METRO',
        description: '使用城市地铁',
        estimatedCost: 2.5, // EUR
        estimatedTimeMinutes: 20,
      },
      {
        type: 'BUS',
        description: '使用城市公交',
        estimatedCost: 2.0,
        estimatedTimeMinutes: 30,
      },
      {
        type: 'WALK',
        description: '步行（如果距离较近）',
        estimatedCost: 0,
        estimatedTimeMinutes: 15,
      },
      {
        type: 'TAXI',
        description: '打车（最快但最贵）',
        estimatedCost: 15,
        estimatedTimeMinutes: 10,
      },
    ];
  }
}
