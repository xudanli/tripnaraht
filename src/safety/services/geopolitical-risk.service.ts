// src/safety/services/geopolitical-risk.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  GeopoliticalRiskLevel,
  RiskType,
  AlertUrgency,
  AlertSeverity,
  DataSourceType,
  RiskFactorsDto,
  TravelAdvisoryDto,
  SafetyAlertDto,
  AffectedRegionDto,
  CountrySafetyAssessmentDto,
  TripSafetyImpactDto,
} from '../dto/geopolitical-risk.dto';
import {
  ADJACENT_COUNTRIES,
  REGIONAL_IMPACT_ZONES,
  COUNTRY_NAMES,
} from '../interfaces/travel-advisory-adapter.interface';
import { UsStateDeptAdapter } from '../adapters/us-state-dept.adapter';
import { UkFcdoAdapter } from '../adapters/uk-fcdo.adapter';

/**
 * 安全事件类型
 */
export const SAFETY_EVENTS = {
  ALERT_CREATED: 'safety.alert.created',
  ALERT_UPDATED: 'safety.alert.updated',
  ALERT_ESCALATED: 'safety.alert.escalated',
  RISK_LEVEL_CHANGED: 'safety.risk.level.changed',
  TRIP_AFFECTED: 'safety.trip.affected',
};

/**
 * 地缘政治风险评估服务
 * 
 * 核心职责：
 * 1. 聚合多数据源的旅行警告
 * 2. 计算综合风险评估
 * 3. 生成安全警报
 * 4. 评估行程安全影响
 */
@Injectable()
export class GeopoliticalRiskService {
  private readonly logger = new Logger(GeopoliticalRiskService.name);
  
  // 活跃警报缓存
  private readonly activeAlerts: Map<string, SafetyAlertDto> = new Map();
  
  // 国家风险评估缓存
  private readonly countryAssessments: Map<string, CountrySafetyAssessmentDto> = new Map();
  private assessmentCacheExpiresAt: number = 0;
  private readonly assessmentCacheTtlMs = 30 * 60 * 1000; // 30分钟

  // 风险权重配置
  private readonly riskWeights = {
    activeConflict: 0.30,
    terrorismThreat: 0.20,
    civilUnrest: 0.10,
    airspaceStatus: 0.15,
    borderStatus: 0.10,
    infrastructureDamage: 0.10,
    evacuationDifficulty: 0.05,
  };

  constructor(
    @Optional() private readonly usStateDeptAdapter?: UsStateDeptAdapter,
    @Optional() private readonly ukFcdoAdapter?: UkFcdoAdapter,
    @Optional() private readonly eventEmitter?: EventEmitter2,
  ) {
    this.logger.log('地缘政治风险评估服务已初始化');
  }

  /**
   * 获取国家安全评估
   */
  async getCountrySafetyAssessment(countryCode: string): Promise<CountrySafetyAssessmentDto> {
    const upperCode = countryCode.toUpperCase();
    
    // 检查缓存
    if (this.assessmentCacheExpiresAt > Date.now()) {
      const cached = this.countryAssessments.get(upperCode);
      if (cached) {
        return cached;
      }
    }

    // 收集数据源警告
    const advisories = await this.collectAdvisories(upperCode);
    
    // 计算风险因素
    const riskFactors = this.calculateRiskFactors(advisories, upperCode);
    
    // 计算综合风险等级
    const overallRiskLevel = this.calculateOverallRiskLevel(riskFactors, advisories);
    
    // 获取活跃警报
    const activeAlerts = this.getActiveAlertsForCountry(upperCode);

    const assessment: CountrySafetyAssessmentDto = {
      countryCode: upperCode,
      countryName: COUNTRY_NAMES[upperCode] || upperCode,
      overallRiskLevel,
      riskFactors,
      activeAdvisories: advisories,
      activeAlerts,
      assessedAt: new Date(),
      nextAssessmentAt: new Date(Date.now() + this.assessmentCacheTtlMs),
      dataSources: this.getAvailableDataSources(),
    };

    // 缓存评估结果
    this.countryAssessments.set(upperCode, assessment);
    this.assessmentCacheExpiresAt = Date.now() + this.assessmentCacheTtlMs;

    return assessment;
  }

  /**
   * 批量获取多国安全评估
   */
  async getMultipleCountryAssessments(
    countryCodes: string[],
    includeAdjacent: boolean = false,
  ): Promise<CountrySafetyAssessmentDto[]> {
    const codes = new Set(countryCodes.map(c => c.toUpperCase()));
    
    // 添加邻国
    if (includeAdjacent) {
      for (const code of [...codes]) {
        const adjacent = ADJACENT_COUNTRIES[code] || [];
        adjacent.forEach(c => codes.add(c));
      }
    }

    const assessments = await Promise.all(
      Array.from(codes).map(code => this.getCountrySafetyAssessment(code)),
    );

    return assessments.sort((a, b) => b.overallRiskLevel - a.overallRiskLevel);
  }

  /**
   * 评估行程安全影响
   */
  async assessTripSafetyImpact(
    tripId: string,
    destinations: string[],
    travelDate?: Date,
  ): Promise<TripSafetyImpactDto> {
    const uniqueDestinations = [...new Set(destinations.map(d => d.toUpperCase()))];
    
    // 获取所有目的地的评估
    const assessments = await this.getMultipleCountryAssessments(uniqueDestinations, true);
    
    // 找出受影响的目的地
    const affectedDestinations: AffectedRegionDto[] = [];
    const relatedAlerts: SafetyAlertDto[] = [];
    let maxRiskLevel = GeopoliticalRiskLevel.SAFE;

    for (const assessment of assessments) {
      if (assessment.overallRiskLevel >= GeopoliticalRiskLevel.CAUTION) {
        const isDirectDestination = uniqueDestinations.includes(assessment.countryCode);
        
        affectedDestinations.push({
          countryCode: assessment.countryCode,
          countryName: assessment.countryName,
          impactLevel: isDirectDestination ? 'DIRECT' : 'ADJACENT',
          riskLevel: assessment.overallRiskLevel,
        });

        relatedAlerts.push(...assessment.activeAlerts);

        if (assessment.overallRiskLevel > maxRiskLevel) {
          maxRiskLevel = assessment.overallRiskLevel;
        }
      }
    }

    // 确定影响程度
    const impactLevel = this.determineImpactLevel(maxRiskLevel, affectedDestinations);
    
    // 生成建议
    const recommendations = this.generateRecommendations(maxRiskLevel, affectedDestinations);
    
    // 生成替代目的地建议
    const alternativeDestinations = maxRiskLevel >= GeopoliticalRiskLevel.HIGH_RISK
      ? this.suggestAlternativeDestinations(uniqueDestinations)
      : [];

    const impact: TripSafetyImpactDto = {
      tripId,
      isAffected: affectedDestinations.length > 0,
      impactLevel,
      affectedDestinations,
      relatedAlerts: [...new Map(relatedAlerts.map(a => [a.id, a])).values()],
      recommendations,
      alternativeDestinations,
      assessedAt: new Date(),
    };

    // 发送事件通知
    if (impact.isAffected && this.eventEmitter) {
      this.eventEmitter.emit(SAFETY_EVENTS.TRIP_AFFECTED, {
        tripId,
        impact,
        timestamp: new Date(),
      });
    }

    return impact;
  }

  /**
   * 创建安全警报（用于紧急情况）
   */
  createAlert(params: {
    type: RiskType;
    title: string;
    summary: string;
    description: string;
    affectedCountries: string[];
    urgency?: AlertUrgency;
    severity?: AlertSeverity;
  }): SafetyAlertDto {
    const alertId = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 计算受影响区域
    const affectedRegions: AffectedRegionDto[] = [];
    
    for (const code of params.affectedCountries) {
      const upperCode = code.toUpperCase();
      affectedRegions.push({
        countryCode: upperCode,
        countryName: COUNTRY_NAMES[upperCode] || upperCode,
        impactLevel: 'DIRECT',
        riskLevel: GeopoliticalRiskLevel.DANGEROUS,
      });

      // 添加邻国
      const adjacent = ADJACENT_COUNTRIES[upperCode] || [];
      for (const adjCode of adjacent) {
        if (!affectedRegions.some(r => r.countryCode === adjCode)) {
          affectedRegions.push({
            countryCode: adjCode,
            countryName: COUNTRY_NAMES[adjCode] || adjCode,
            impactLevel: 'ADJACENT',
            riskLevel: GeopoliticalRiskLevel.HIGH_RISK,
          });
        }
      }
    }

    // 计算综合风险等级
    const riskLevel = params.severity === AlertSeverity.EXTREME
      ? GeopoliticalRiskLevel.NO_GO
      : params.severity === AlertSeverity.SEVERE
        ? GeopoliticalRiskLevel.DANGEROUS
        : GeopoliticalRiskLevel.HIGH_RISK;

    const alert: SafetyAlertDto = {
      id: alertId,
      type: params.type,
      urgency: params.urgency || AlertUrgency.IMMEDIATE,
      severity: params.severity || AlertSeverity.SEVERE,
      riskLevel,
      title: params.title,
      summary: params.summary,
      description: params.description,
      affectedRegions,
      recommendations: this.generateAlertRecommendations(params.type, riskLevel),
      createdAt: new Date(),
      isActive: true,
    };

    // 存储警报
    this.activeAlerts.set(alertId, alert);

    // 发送事件
    if (this.eventEmitter) {
      this.eventEmitter.emit(SAFETY_EVENTS.ALERT_CREATED, {
        alert,
        timestamp: new Date(),
      });
    }

    this.logger.warn(`创建安全警报: ${alert.title} - 影响 ${affectedRegions.length} 个地区`);

    return alert;
  }

  /**
   * 模拟战争爆发场景
   * 用于测试预警系统
   */
  simulateWarScenario(params: {
    conflictParties: string[];
    conflictZone: string;
    escalationLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }): SafetyAlertDto {
    const severityMap: Record<string, AlertSeverity> = {
      LOW: AlertSeverity.MODERATE,
      MEDIUM: AlertSeverity.SEVERE,
      HIGH: AlertSeverity.SEVERE,
      CRITICAL: AlertSeverity.EXTREME,
    };

    const urgencyMap: Record<string, AlertUrgency> = {
      LOW: AlertUrgency.EXPECTED,
      MEDIUM: AlertUrgency.EXPECTED,
      HIGH: AlertUrgency.IMMEDIATE,
      CRITICAL: AlertUrgency.IMMEDIATE,
    };

    // 确定所有受影响国家
    const affectedCountries = new Set<string>();
    
    // 添加直接冲突方
    params.conflictParties.forEach(c => affectedCountries.add(c.toUpperCase()));
    
    // 添加冲突区域国家
    const conflictZone = params.conflictZone.toUpperCase();
    const zoneCountries = REGIONAL_IMPACT_ZONES[conflictZone] || [];
    zoneCountries.forEach(c => affectedCountries.add(c));

    // 添加邻国
    for (const code of params.conflictParties) {
      const adjacent = ADJACENT_COUNTRIES[code.toUpperCase()] || [];
      adjacent.forEach(c => affectedCountries.add(c));
    }

    const conflictPartiesNames = params.conflictParties
      .map(c => COUNTRY_NAMES[c.toUpperCase()] || c)
      .join(', ');

    return this.createAlert({
      type: RiskType.WAR,
      title: `Armed Conflict Alert: ${conflictPartiesNames}`,
      summary: `Military conflict involving ${conflictPartiesNames}. Multiple countries in ${params.conflictZone} region affected.`,
      description: `
A significant military conflict has been detected involving ${conflictPartiesNames}. 
This situation poses severe risks to civilian safety, travel infrastructure, and regional stability.

Escalation Level: ${params.escalationLevel}

Affected regions include direct conflict zones and adjacent countries that may experience:
- Airspace closures and flight disruptions
- Border restrictions or closures
- Supply chain disruptions
- Potential spillover of conflict
- Increased security threats

Travelers in or planning to visit affected areas should take immediate precautions.
      `.trim(),
      affectedCountries: Array.from(affectedCountries),
      urgency: urgencyMap[params.escalationLevel],
      severity: severityMap[params.escalationLevel],
    });
  }

  /**
   * 获取所有活跃警报
   */
  getActiveAlerts(): SafetyAlertDto[] {
    return Array.from(this.activeAlerts.values())
      .filter(a => a.isActive)
      .sort((a, b) => b.riskLevel - a.riskLevel);
  }

  /**
   * 获取指定国家的活跃警报
   */
  getActiveAlertsForCountry(countryCode: string): SafetyAlertDto[] {
    const upperCode = countryCode.toUpperCase();
    return this.getActiveAlerts().filter(alert =>
      alert.affectedRegions.some(r => r.countryCode === upperCode),
    );
  }

  /**
   * 关闭警报
   */
  deactivateAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.isActive = false;
      alert.updatedAt = new Date();
      this.logger.log(`警报已关闭: ${alertId}`);
      return true;
    }
    return false;
  }

  // ==================== 私有方法 ====================

  /**
   * 收集多数据源警告
   */
  private async collectAdvisories(countryCode: string): Promise<TravelAdvisoryDto[]> {
    const advisories: TravelAdvisoryDto[] = [];

    // 从美国国务院获取
    if (this.usStateDeptAdapter?.isAvailable()) {
      try {
        const usAdvisory = await this.usStateDeptAdapter.getAdvisory(countryCode);
        if (usAdvisory) {
          advisories.push(usAdvisory);
        }
      } catch (error: any) {
        this.logger.debug(`US State Dept数据获取失败: ${error.message}`);
      }
    }

    // 从英国外交部获取
    if (this.ukFcdoAdapter?.isAvailable()) {
      try {
        const ukAdvisory = await this.ukFcdoAdapter.getAdvisory(countryCode);
        if (ukAdvisory) {
          advisories.push(ukAdvisory);
        }
      } catch (error: any) {
        this.logger.debug(`UK FCDO数据获取失败: ${error.message}`);
      }
    }

    return advisories;
  }

  /**
   * 计算风险因素
   */
  private calculateRiskFactors(
    advisories: TravelAdvisoryDto[],
    countryCode: string,
  ): RiskFactorsDto {
    // 初始化风险因素
    const factors: RiskFactorsDto = {
      activeConflict: 0,
      terrorismThreat: 0,
      civilUnrest: 0,
      airspaceStatus: 0,
      borderStatus: 0,
      infrastructureDamage: 0,
      evacuationDifficulty: 0,
    };

    if (advisories.length === 0) {
      return factors;
    }

    // 从警告中提取风险类型
    const allRiskTypes = advisories.flatMap(a => a.riskTypes || []);
    const maxRiskLevel = Math.max(...advisories.map(a => a.riskLevel));

    // 根据风险类型计算各因素
    if (allRiskTypes.includes(RiskType.WAR) || allRiskTypes.includes(RiskType.ARMED_CONFLICT)) {
      factors.activeConflict = Math.min(1, maxRiskLevel / 5 + 0.3);
      factors.airspaceStatus = Math.min(1, maxRiskLevel / 5 + 0.2);
      factors.infrastructureDamage = Math.min(1, maxRiskLevel / 5 + 0.1);
    }

    if (allRiskTypes.includes(RiskType.TERRORISM)) {
      factors.terrorismThreat = Math.min(1, maxRiskLevel / 5 + 0.2);
    }

    if (allRiskTypes.includes(RiskType.CIVIL_UNREST) || allRiskTypes.includes(RiskType.POLITICAL_INSTABILITY)) {
      factors.civilUnrest = Math.min(1, maxRiskLevel / 5 + 0.1);
    }

    // 根据综合风险等级调整边境和撤离难度
    if (maxRiskLevel >= GeopoliticalRiskLevel.DANGEROUS) {
      factors.borderStatus = Math.min(1, maxRiskLevel / 5);
      factors.evacuationDifficulty = Math.min(1, maxRiskLevel / 5);
    }

    // 检查是否有邻国冲突
    const adjacentCountries = ADJACENT_COUNTRIES[countryCode] || [];
    const hasAdjacentConflict = adjacentCountries.some(adj => 
      this.countryAssessments.has(adj) && 
      this.countryAssessments.get(adj)!.overallRiskLevel >= GeopoliticalRiskLevel.HIGH_RISK,
    );

    if (hasAdjacentConflict) {
      factors.activeConflict = Math.min(1, factors.activeConflict + 0.2);
      factors.borderStatus = Math.min(1, factors.borderStatus + 0.3);
    }

    return factors;
  }

  /**
   * 计算综合风险等级
   */
  private calculateOverallRiskLevel(
    factors: RiskFactorsDto,
    advisories: TravelAdvisoryDto[],
  ): GeopoliticalRiskLevel {
    // 方法1：基于数据源警告的最高等级
    const maxAdvisoryLevel = advisories.length > 0
      ? Math.max(...advisories.map(a => a.riskLevel))
      : GeopoliticalRiskLevel.SAFE;

    // 方法2：基于风险因素的加权计算
    const weightedScore = 
      factors.activeConflict * this.riskWeights.activeConflict +
      factors.terrorismThreat * this.riskWeights.terrorismThreat +
      factors.civilUnrest * this.riskWeights.civilUnrest +
      factors.airspaceStatus * this.riskWeights.airspaceStatus +
      factors.borderStatus * this.riskWeights.borderStatus +
      factors.infrastructureDamage * this.riskWeights.infrastructureDamage +
      factors.evacuationDifficulty * this.riskWeights.evacuationDifficulty;

    const calculatedLevel = 
      weightedScore >= 0.8 ? GeopoliticalRiskLevel.NO_GO :
      weightedScore >= 0.6 ? GeopoliticalRiskLevel.DANGEROUS :
      weightedScore >= 0.4 ? GeopoliticalRiskLevel.HIGH_RISK :
      weightedScore >= 0.2 ? GeopoliticalRiskLevel.CAUTION :
      GeopoliticalRiskLevel.SAFE;

    // 取两种方法的最高值
    return Math.max(maxAdvisoryLevel, calculatedLevel);
  }

  /**
   * 确定行程影响程度
   */
  private determineImpactLevel(
    maxRiskLevel: GeopoliticalRiskLevel,
    affectedDestinations: AffectedRegionDto[],
  ): 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (affectedDestinations.length === 0) {
      return 'NONE';
    }

    const hasDirectImpact = affectedDestinations.some(d => d.impactLevel === 'DIRECT');

    if (maxRiskLevel >= GeopoliticalRiskLevel.NO_GO) {
      return 'CRITICAL';
    }
    if (maxRiskLevel >= GeopoliticalRiskLevel.DANGEROUS) {
      return hasDirectImpact ? 'CRITICAL' : 'HIGH';
    }
    if (maxRiskLevel >= GeopoliticalRiskLevel.HIGH_RISK) {
      return hasDirectImpact ? 'HIGH' : 'MEDIUM';
    }
    if (maxRiskLevel >= GeopoliticalRiskLevel.CAUTION) {
      return hasDirectImpact ? 'MEDIUM' : 'LOW';
    }
    return 'LOW';
  }

  /**
   * 生成安全建议
   */
  private generateRecommendations(
    riskLevel: GeopoliticalRiskLevel,
    affectedDestinations: AffectedRegionDto[],
  ): string[] {
    const recommendations: string[] = [];

    if (riskLevel >= GeopoliticalRiskLevel.NO_GO) {
      recommendations.push('⛔ 强烈建议取消或推迟前往该地区的行程');
      recommendations.push('🏃 如已在当地，请立即联系本国大使馆了解撤离安排');
      recommendations.push('📱 确保手机国际漫游已开通，保持与家人联系');
      recommendations.push('📋 向本国外交部登记您的行程信息');
    } else if (riskLevel >= GeopoliticalRiskLevel.DANGEROUS) {
      recommendations.push('⚠️ 建议重新考虑前往该地区的必要性');
      recommendations.push('✈️ 密切关注航班动态，准备备选航线');
      recommendations.push('🏥 确认旅行保险是否覆盖战争/冲突风险');
      recommendations.push('📍 提前了解当地大使馆/领事馆位置');
    } else if (riskLevel >= GeopoliticalRiskLevel.HIGH_RISK) {
      recommendations.push('🔔 保持对当地新闻的关注');
      recommendations.push('📱 下载当地紧急联系应用');
      recommendations.push('💼 准备紧急撤离物资（护照复印件、现金等）');
      recommendations.push('🚫 避免前往边境地区和已知冲突区域');
    } else if (riskLevel >= GeopoliticalRiskLevel.CAUTION) {
      recommendations.push('📰 出发前查看最新旅行警告');
      recommendations.push('🔐 注意人身和财产安全');
      recommendations.push('📞 保存当地紧急联系电话');
    }

    // 针对特定受影响区域的建议
    const directAffected = affectedDestinations.filter(d => d.impactLevel === 'DIRECT');
    if (directAffected.length > 0) {
      const countries = directAffected.map(d => d.countryName).join(', ');
      recommendations.push(`📍 ${countries} 为直接受影响区域，请特别注意`);
    }

    return recommendations;
  }

  /**
   * 生成警报建议
   */
  private generateAlertRecommendations(type: RiskType, riskLevel: GeopoliticalRiskLevel): string[] {
    const recommendations: string[] = [];

    if (type === RiskType.WAR || type === RiskType.ARMED_CONFLICT) {
      recommendations.push('监控空域状态，航班可能被取消或改道');
      recommendations.push('边境可能关闭，准备替代出入境方案');
      recommendations.push('联系大使馆登记信息，了解撤离计划');
      recommendations.push('避免聚集区域和政府/军事设施');
    }

    if (type === RiskType.TERRORISM) {
      recommendations.push('避免人员密集场所');
      recommendations.push('保持警觉，注意可疑人员和物品');
      recommendations.push('遵循当地安全部门指引');
    }

    if (type === RiskType.CIVIL_UNREST) {
      recommendations.push('避开示威游行区域');
      recommendations.push('关注当地新闻和社交媒体');
      recommendations.push('准备室内物资，减少外出');
    }

    if (riskLevel >= GeopoliticalRiskLevel.DANGEROUS) {
      recommendations.push('立即联系保险公司确认保障范围');
      recommendations.push('准备紧急联系人名单');
      recommendations.push('保留足够现金（当地货币和美元）');
    }

    return recommendations;
  }

  /**
   * 建议替代目的地
   */
  private suggestAlternativeDestinations(originalDestinations: string[]): string[] {
    const alternatives: string[] = [];
    
    // 简单的替代逻辑 - 实际应用中应该更加智能
    const safeAlternatives: Record<string, string[]> = {
      // 中东高风险 -> 相对安全的邻近地区
      IR: ['TR', 'AE', 'OM'],
      IQ: ['JO', 'AE', 'OM'],
      SY: ['TR', 'JO', 'CY'],
      IL: ['CY', 'GR', 'JO'],
      LB: ['CY', 'JO', 'TR'],
      // 东欧高风险 -> 相对安全的欧洲国家
      UA: ['PL', 'RO', 'HU'],
      RU: ['FI', 'EE', 'PL'],
      BY: ['PL', 'LT', 'LV'],
    };

    for (const dest of originalDestinations) {
      const alts = safeAlternatives[dest];
      if (alts) {
        for (const alt of alts) {
          if (!alternatives.includes(alt) && !originalDestinations.includes(alt)) {
            alternatives.push(alt);
          }
        }
      }
    }

    return alternatives.slice(0, 5).map(code => 
      `${COUNTRY_NAMES[code] || code} (${code})`,
    );
  }

  /**
   * 获取可用数据源列表
   */
  private getAvailableDataSources(): DataSourceType[] {
    const sources: DataSourceType[] = [];
    
    if (this.usStateDeptAdapter?.isAvailable()) {
      sources.push(DataSourceType.US_STATE_DEPT);
    }
    if (this.ukFcdoAdapter?.isAvailable()) {
      sources.push(DataSourceType.UK_FCDO);
    }
    
    return sources;
  }
}
