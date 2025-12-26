// src/route-directions/plugins/compliance-plugin.service.ts
/**
 * Compliance Plugin Service
 * 
 * 合规插件：将 requiresPermit/requiresGuide 从"约束字段"升级为"行动建议 + 拦截策略"
 * 
 * 功能：
 * - 输入：selected RD + itinerary draft + regions/poi types
 * - 输出：complianceChecklist[]（办理项、建议提前天数、是否必须向导/许可、风险提醒）
 * - hard：用户明确拒绝办理 → Abu 降级为城市/轻线
 * - soft：用户不确定 → 提示办理入口+时间，并保留备选计划
 */

import { Injectable, Logger } from '@nestjs/common';
import { RouteDirectionRecommendation } from '../services/route-direction-selector.service';
import { TripPlan, PlanDay } from '../../trips/decision/plan-model';
import { RouteConstraints, ComplianceRules } from '../interfaces/route-direction.interface';

export interface ComplianceChecklistItem {
  id: string;
  type: 'permit' | 'guide' | 'document' | 'restriction';
  title: string; // 办理项名称
  description: string; // 详细描述
  required: boolean; // 是否必须
  recommendedDaysAhead: number; // 建议提前天数
  urgency: 'low' | 'medium' | 'high' | 'critical'; // 紧急程度
  riskReminder?: string; // 风险提醒
  applicationInfo?: {
    name: string; // 许可/向导名称
    link?: string; // 办理入口链接
    cost?: number; // 费用
    provider?: string; // 提供商
  };
  alternativeOptions?: string[]; // 备选方案
  regions?: string[]; // 适用区域
  poiTypes?: string[]; // 适用 POI 类型
}

export interface ComplianceChecklist {
  items: ComplianceChecklistItem[];
  summary: {
    totalItems: number;
    requiredItems: number;
    criticalItems: number;
    estimatedDaysAhead: number; // 最早需要提前的天数
  };
  userActionRequired: {
    hard: ComplianceChecklistItem[]; // 必须办理的项（hard constraint）
    soft: ComplianceChecklistItem[]; // 建议办理的项（soft constraint）
  };
  downgradeOptions?: {
    reason: string;
    alternativeRouteDirections?: string[]; // 备选路线方向名称
  };
}

@Injectable()
export class CompliancePluginService {
  private readonly logger = new Logger(CompliancePluginService.name);

  /**
   * 生成合规检查清单
   */
  generateChecklist(
    routeDirection: RouteDirectionRecommendation,
    itineraryDraft?: TripPlan,
    regions?: string[],
    poiTypes?: string[],
    userComplianceStatus?: {
      permitAccepted?: boolean;
      guideAccepted?: boolean;
      permitRejected?: boolean;
      guideRejected?: boolean;
    }
  ): ComplianceChecklist {
    const rd = routeDirection.routeDirection as any;
    const constraints = (rd.constraints || {}) as RouteConstraints;
    const complianceRules = (rd.complianceRules || rd.metadata?.complianceRules || {}) as ComplianceRules;
    const countryCode = rd.countryCode || '';

    const items: ComplianceChecklistItem[] = [];

    // 1. 检查许可要求
    const requiresPermit = constraints.hard?.requiresPermit || 
                          constraints.requiresPermit || 
                          complianceRules.requiresPermit;
    
    if (requiresPermit) {
      const permitItem = this.createPermitItem(
        countryCode,
        complianceRules.permitInfo,
        regions,
        userComplianceStatus?.permitRejected
      );
      if (permitItem) {
        items.push(permitItem);
      }
    }

    // 2. 检查向导要求
    const requiresGuide = constraints.hard?.requiresGuide || 
                         constraints.requiresGuide || 
                         complianceRules.requiresGuide;
    
    if (requiresGuide) {
      const guideItem = this.createGuideItem(
        countryCode,
        regions,
        userComplianceStatus?.guideRejected
      );
      if (guideItem) {
        items.push(guideItem);
      }
    }

    // 3. 检查限制区域
    if (complianceRules.restrictedAreas && complianceRules.restrictedAreas.length > 0) {
      const restrictionItem = this.createRestrictionItem(
        countryCode,
        complianceRules.restrictedAreas,
        regions
      );
      if (restrictionItem) {
        items.push(restrictionItem);
      }
    }

    // 4. 根据行程草案检查特定区域/POI 类型的合规要求
    if (itineraryDraft && (regions || poiTypes)) {
      const additionalItems = this.checkItineraryCompliance(
        itineraryDraft,
        countryCode,
        regions,
        poiTypes
      );
      items.push(...additionalItems);
    }

    // 5. 分类 hard/soft 项
    const hardItems = items.filter(item => item.required && item.urgency === 'critical');
    const softItems = items.filter(item => !item.required || item.urgency !== 'critical');

    // 6. 如果用户明确拒绝办理，生成降级选项
    let downgradeOptions: ComplianceChecklist['downgradeOptions'] | undefined;
    if (userComplianceStatus?.permitRejected || userComplianceStatus?.guideRejected) {
      downgradeOptions = this.generateDowngradeOptions(countryCode, hardItems);
    }

    // 7. 计算摘要
    const summary = {
      totalItems: items.length,
      requiredItems: items.filter(item => item.required).length,
      criticalItems: hardItems.length,
      estimatedDaysAhead: Math.max(...items.map(item => item.recommendedDaysAhead), 0),
    };

    return {
      items,
      summary,
      userActionRequired: {
        hard: hardItems,
        soft: softItems,
      },
      downgradeOptions,
    };
  }

  /**
   * 创建许可项
   */
  private createPermitItem(
    countryCode: string,
    permitInfo?: ComplianceRules['permitInfo'],
    regions?: string[],
    userRejected?: boolean
  ): ComplianceChecklistItem | null {
    const countryPermitConfig = this.getCountryPermitConfig(countryCode);
    
    if (!countryPermitConfig && !permitInfo) {
      return null;
    }

    const config = permitInfo || countryPermitConfig;

    return {
      id: `permit_${countryCode}`,
      type: 'permit',
      title: config?.name || `${countryCode} 旅行许可`,
      description: config?.name 
        ? `需要办理 ${config.name}。${userRejected ? '⚠️ 您已拒绝办理，系统将提供备选路线。' : '未办理可能导致无法进入相关区域。'}`
        : `该地区需要特殊许可。${userRejected ? '⚠️ 您已拒绝办理，系统将提供备选路线。' : '请提前查询并办理。'}`,
      required: !userRejected, // 如果用户拒绝，则不再必须
      recommendedDaysAhead: this.getRecommendedDaysAhead(countryCode, 'permit'),
      urgency: userRejected ? 'low' : (countryCode === 'NP' || countryCode === 'CN_XZ' ? 'critical' : 'high'),
      riskReminder: userRejected 
        ? '已拒绝办理，将使用备选路线'
        : '未办理许可可能导致无法进入相关区域，行程将无法执行',
      applicationInfo: {
        name: config?.name || `${countryCode} 旅行许可`,
        link: config?.link,
        cost: config?.cost,
        provider: config?.name,
      },
      alternativeOptions: userRejected ? ['使用城市/轻线备选路线'] : undefined,
      regions,
    };
  }

  /**
   * 创建向导项
   */
  private createGuideItem(
    countryCode: string,
    regions?: string[],
    userRejected?: boolean
  ): ComplianceChecklistItem | null {
    const countryGuideConfig = this.getCountryGuideConfig(countryCode);
    
    if (!countryGuideConfig) {
      return null;
    }

    return {
      id: `guide_${countryCode}`,
      type: 'guide',
      title: countryGuideConfig.name,
      description: `${countryGuideConfig.name}。${userRejected ? '⚠️ 您已拒绝向导，系统将提供备选路线。' : '某些区域要求必须有向导陪同。'}`,
      required: !userRejected,
      recommendedDaysAhead: this.getRecommendedDaysAhead(countryCode, 'guide'),
      urgency: userRejected ? 'low' : (countryCode === 'NP' ? 'critical' : 'high'),
      riskReminder: userRejected
        ? '已拒绝向导，将使用备选路线'
        : '未安排向导可能导致无法进入相关区域',
      applicationInfo: {
        name: countryGuideConfig.name,
        link: countryGuideConfig.link,
        cost: countryGuideConfig.cost,
        provider: countryGuideConfig.provider,
      },
      alternativeOptions: userRejected ? ['使用城市/轻线备选路线'] : undefined,
      regions,
    };
  }

  /**
   * 创建限制区域项
   */
  private createRestrictionItem(
    countryCode: string,
    restrictedAreas: string[],
    regions?: string[]
  ): ComplianceChecklistItem {
    return {
      id: `restriction_${countryCode}`,
      type: 'restriction',
      title: '限制区域提醒',
      description: `以下区域有特殊限制：${restrictedAreas.join('、')}。请提前了解相关规定。`,
      required: false,
      recommendedDaysAhead: 14,
      urgency: 'medium',
      riskReminder: '进入限制区域可能需要特殊许可或向导',
      regions: restrictedAreas,
    };
  }

  /**
   * 检查行程草案的合规要求
   */
  private checkItineraryCompliance(
    itinerary: TripPlan,
    countryCode: string,
    regions?: string[],
    poiTypes?: string[]
  ): ComplianceChecklistItem[] {
    const items: ComplianceChecklistItem[] = [];

    // 检查行程中是否包含需要特殊许可的区域
    // 这里可以根据实际需求扩展检查逻辑

    return items;
  }

  /**
   * 生成降级选项
   */
  private generateDowngradeOptions(
    countryCode: string,
    hardItems: ComplianceChecklistItem[]
  ): ComplianceChecklist['downgradeOptions'] {
    if (hardItems.length === 0) {
      return undefined;
    }

    const reasons = hardItems.map(item => item.title).join('、');
    
    // 根据国家代码生成备选路线方向建议
    const alternativeRoutes = this.getAlternativeRoutes(countryCode);

    return {
      reason: `用户拒绝办理：${reasons}。建议使用以下备选路线：`,
      alternativeRouteDirections: alternativeRoutes,
    };
  }

  /**
   * 获取国家许可配置
   */
  private getCountryPermitConfig(countryCode: string): ComplianceRules['permitInfo'] | null {
    const configs: Record<string, ComplianceRules['permitInfo']> = {
      'NP': {
        name: 'TIMS (Trekkers Information Management System)',
        link: 'https://www.timsnepal.gov.np',
        cost: 20, // USD
      },
      'CN_XZ': {
        name: '西藏边防证',
        link: 'https://www.xizang.gov.cn',
        cost: 0,
      },
      'BT': {
        name: 'Bhutan Visa',
        link: 'https://www.mfa.gov.bt',
        cost: 40, // USD per day
      },
    };

    return configs[countryCode] || null;
  }

  /**
   * 获取国家向导配置
   */
  private getCountryGuideConfig(countryCode: string): {
    name: string;
    link?: string;
    cost?: number;
    provider?: string;
  } | null {
    const configs: Record<string, any> = {
      'NP': {
        name: '尼泊尔徒步向导',
        link: 'https://www.taan.org.np',
        cost: 25, // USD per day
        provider: 'TAAN (Trekking Agencies Association of Nepal)',
      },
      'CN_XZ': {
        name: '西藏向导',
        link: 'https://www.xizang.gov.cn',
        cost: 300, // CNY per day
      },
    };

    return configs[countryCode] || null;
  }

  /**
   * 获取建议提前天数
   */
  private getRecommendedDaysAhead(countryCode: string, type: 'permit' | 'guide'): number {
    const configs: Record<string, Record<string, number>> = {
      'NP': {
        permit: 30, // TIMS 建议提前 30 天
        guide: 14,  // 向导建议提前 14 天
      },
      'CN_XZ': {
        permit: 21, // 边防证建议提前 21 天
        guide: 7,   // 向导建议提前 7 天
      },
      'BT': {
        permit: 30,
        guide: 14,
      },
    };

    return configs[countryCode]?.[type] || 14; // 默认 14 天
  }

  /**
   * 获取备选路线方向
   */
  private getAlternativeRoutes(countryCode: string): string[] {
    const alternatives: Record<string, string[]> = {
      'NP': [
        '尼泊尔城市文化之旅',
        '尼泊尔轻松徒步路线',
        '加德满都谷地探索',
      ],
      'CN_XZ': [
        '西藏城市文化之旅',
        '拉萨周边轻松游',
        '日喀则文化探索',
      ],
      'BT': [
        '不丹文化之旅',
        '廷布城市探索',
      ],
    };

    return alternatives[countryCode] || ['城市/轻线备选路线'];
  }
}

