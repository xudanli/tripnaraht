// src/data-contracts/services/iceland-froad.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { FRoadInfo, RouteRiskAssessment, CarRentalInsurance } from '../interfaces/iceland-specific.interface';

/**
 * 冰岛 F-Road 服务
 * 
 * 处理 F-Road（高地公路）相关逻辑：
 * - 识别 F-Road
 * - 检查是否需要 4WD
 * - 评估路径风险
 * - 保险建议
 */
@Injectable()
export class IcelandFRoadService {
  private readonly logger = new Logger(IcelandFRoadService.name);

  /**
   * F-Road 编号模式（以 F 开头的道路编号）
   */
  private readonly fRoadPattern = /^F\d+/i;

  /**
   * 检查道路编号是否为 F-Road
   */
  isFRoad(roadNumber: string): boolean {
    if (!roadNumber) {
      return false;
    }
    return this.fRoadPattern.test(roadNumber.trim());
  }

  /**
   * 从 POI 标签中提取 F-Road 信息
   */
  extractFRoadFromTags(tags: Record<string, any>): FRoadInfo | null {
    const roadNumber = tags.ref || tags['ref:road'] || tags.name;
    
    if (!roadNumber || !this.isFRoad(roadNumber)) {
      return null;
    }

    return {
      roadNumber: roadNumber.toUpperCase(),
      isFRoad: true,
      status: tags.status === 'closed' ? 'closed' : 
              tags.status === 'restricted' ? 'restricted' : 'open',
      restrictionReason: tags.restriction_reason || tags.restrictionReason,
      requires4WD: tags.requires_4wd !== false, // 默认需要 4WD
      difficultyLevel: this.parseDifficultyLevel(tags.difficulty || tags.difficulty_level),
      snowDepth: tags.snow_depth ? parseInt(tags.snow_depth) : undefined,
      isSlippery: tags.slippery === true || tags.slippery === 'yes',
      lastUpdated: new Date(),
    };
  }

  /**
   * 评估路径风险
   * 
   * 根据路径中的 F-Road 占比、碎石路面占比等评估风险
   */
  assessRouteRisk(
    routeSegments: Array<{
      roadNumber?: string;
      roadType?: string;
      isGravel?: boolean;
    }>,
    vehicleType?: '2WD' | '4WD',
    insurance?: CarRentalInsurance[]
  ): RouteRiskAssessment {
    const totalSegments = routeSegments.length;
    let fRoadCount = 0;
    let gravelCount = 0;
    let containsFRoad = false;
    const segmentRisks: RouteRiskAssessment['segmentRisks'] = [];
    const riskReasons: string[] = [];
    const insuranceRecommendations: string[] = [];

    for (const segment of routeSegments) {
      const isFRoad = segment.roadNumber ? this.isFRoad(segment.roadNumber) : false;
      const isGravel = segment.isGravel || segment.roadType === 'gravel';

      if (isFRoad) {
        fRoadCount++;
        containsFRoad = true;

        // 如果是 2WD 车辆，F-Road 是高风险
        if (vehicleType === '2WD') {
          segmentRisks.push({
            segmentId: segment.roadNumber || 'unknown',
            riskLevel: 3,
            riskReason: `F-Road ${segment.roadNumber} 需要 4WD 车辆`,
            fRoadInfo: {
              roadNumber: segment.roadNumber!,
              isFRoad: true,
              status: 'restricted',
              requires4WD: true,
              lastUpdated: new Date(),
            },
          });
          riskReasons.push(`F-Road ${segment.roadNumber} 需要 4WD`);
        } else {
          segmentRisks.push({
            segmentId: segment.roadNumber || 'unknown',
            riskLevel: 2,
            riskReason: `F-Road ${segment.roadNumber} 需要谨慎驾驶`,
            fRoadInfo: {
              roadNumber: segment.roadNumber!,
              isFRoad: true,
              status: 'open',
              requires4WD: true,
              lastUpdated: new Date(),
            },
          });
        }
      }

      if (isGravel) {
        gravelCount++;
      }
    }

    const fRoadPercentage = totalSegments > 0 ? (fRoadCount / totalSegments) * 100 : 0;
    const gravelRoadPercentage = totalSegments > 0 ? (gravelCount / totalSegments) * 100 : 0;

    // 计算总体风险等级
    let overallRiskLevel: 0 | 1 | 2 | 3 = 0;

    // 2WD 车辆 + F-Road = 高风险
    if (vehicleType === '2WD' && containsFRoad) {
      overallRiskLevel = 3;
      riskReasons.push('2WD 车辆无法安全通过 F-Road');
    }
    // 碎石路面占比超过 30% = 中等风险
    else if (gravelRoadPercentage > 30) {
      overallRiskLevel = 2;
      riskReasons.push(`碎石路面占比 ${gravelRoadPercentage.toFixed(1)}%，建议购买 GP 碎石险`);
      
      // 检查是否已购买 GP 保险
      const hasGPInsurance = insurance?.some(ins => ins.type === 'GP' && ins.isPurchased);
      if (!hasGPInsurance) {
        insuranceRecommendations.push('建议购买 GP（碎石险）');
      }
    }
    // F-Road 占比超过 50% = 中等风险
    else if (fRoadPercentage > 50) {
      overallRiskLevel = 2;
      riskReasons.push(`F-Road 占比 ${fRoadPercentage.toFixed(1)}%，需要 4WD 车辆`);
    }

    return {
      routeId: 'route-' + Date.now(),
      overallRiskLevel,
      riskReasons,
      fRoadPercentage,
      gravelRoadPercentage,
      containsFRoad,
      containsRiverCrossing: false, // TODO: 从路径中检测河流渡口
      insuranceRecommendations,
      segmentRisks,
    };
  }

  /**
   * 检查车辆类型是否适合路径
   */
  isVehicleSuitableForRoute(
    vehicleType: '2WD' | '4WD',
    routeSegments: Array<{ roadNumber?: string }>
  ): { suitable: boolean; reason?: string } {
    const hasFRoad = routeSegments.some(segment => 
      segment.roadNumber && this.isFRoad(segment.roadNumber)
    );

    if (vehicleType === '2WD' && hasFRoad) {
      return {
        suitable: false,
        reason: '2WD 车辆无法安全通过 F-Road，请使用 4WD 车辆或修改路径',
      };
    }

    return { suitable: true };
  }

  /**
   * 解析难度等级
   */
  private parseDifficultyLevel(difficulty: any): 1 | 2 | 3 | 4 | 5 {
    if (typeof difficulty === 'number') {
      return Math.max(1, Math.min(5, difficulty)) as 1 | 2 | 3 | 4 | 5;
    }

    if (typeof difficulty === 'string') {
      const difficultyMap: Record<string, 1 | 2 | 3 | 4 | 5> = {
        'easy': 1,
        'moderate': 2,
        'medium': 3,
        'hard': 4,
        'difficult': 4,
        'extreme': 5,
      };
      return difficultyMap[difficulty.toLowerCase()] || 3;
    }

    return 3; // 默认中等难度
  }
}

