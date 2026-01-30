// src/trips/readiness/services/risk-type-mapper.service.ts
import { Injectable } from '@nestjs/common';
import { HazardType } from '../types/readiness-pack.types';

/**
 * 风险类型映射服务
 * 
 * 用于将技术性的风险类型转换为用户友好的显示名称
 */
@Injectable()
export class RiskTypeMapperService {
  /**
   * 风险类型标签映射
   */
  private readonly TYPE_LABELS: Record<HazardType | string, {
    zh: string;
    en: string;
    category: 'weather' | 'terrain' | 'safety' | 'logistics' | 'other';
    icon?: string;
    description?: string; // 类型说明
  }> = {
    // 大写风险类型（兼容旧数据）
    'WEATHER': {
      zh: '天气风险',
      en: 'Weather Risk',
      category: 'weather',
      icon: '🌨️',
      description: '天气相关风险，如极端天气、暴风雪等',
    },
    'TERRAIN': {
      zh: '地形风险',
      en: 'Terrain Risk',
      category: 'terrain',
      icon: '⛰️',
      description: '地形复杂或危险，如陡峭山路、F-road等',
    },
    'WATER': {
      zh: '水上安全',
      en: 'Water Safety',
      category: 'safety',
      icon: '🌊',
      description: '涉及水域活动，需要注意潮汐、海浪、水温等安全因素',
    },
    'OTHER': {
      zh: '其他风险',
      en: 'Other Risk',
      category: 'other',
      icon: '⚠️',
      description: '其他类型的风险',
    },
    // 标准风险类型
    'weather_extreme': {
      zh: '极端天气',
      en: 'Extreme Weather',
      category: 'weather',
      icon: '🌨️',
      description: '可能遭遇极端天气条件，如暴风雪、强风、低温等',
    },
    'terrain': {
      zh: '地形风险',
      en: 'Terrain Risk',
      category: 'terrain',
      icon: '⛰️',
      description: '地形复杂或危险，如陡峭山路、F-road、冰川等',
    },
    'wildlife': {
      zh: '野生动物',
      en: 'Wildlife',
      category: 'safety',
      icon: '🐻',
      description: '可能遭遇野生动物，需要注意安全距离和防护',
    },
    'water_safety': {
      zh: '水上安全',
      en: 'Water Safety',
      category: 'safety',
      icon: '🌊',
      description: '涉及水域活动，需要注意潮汐、海浪、水温等安全因素',
    },
    'logistics_remote': {
      zh: '偏远地区',
      en: 'Remote Area',
      category: 'logistics',
      icon: '🗺️',
      description: '位于偏远地区，交通不便，救援困难，需要充分准备',
    },
    'crime': {
      zh: '治安风险',
      en: 'Crime Risk',
      category: 'safety',
      icon: '⚠️',
      description: '存在治安风险，需要注意个人财物和人身安全',
    },
    'healthcare_gap': {
      zh: '医疗资源',
      en: 'Healthcare Gap',
      category: 'safety',
      icon: '🏥',
      description: '医疗资源有限，需要准备常用药品和急救用品',
    },
    'regulatory': {
      zh: '法规要求',
      en: 'Regulatory',
      category: 'other',
      icon: '📋',
      description: '涉及法规要求，如许可证、保险、签证等',
    },
  };

  /**
   * 获取风险类型的中文标签
   */
  getTypeLabel(type: string, lang: 'en' | 'zh' = 'zh'): string {
    // 尝试直接匹配
    if (this.TYPE_LABELS[type]) {
      return this.TYPE_LABELS[type][lang];
    }
    // 尝试小写匹配
    const lowerType = type.toLowerCase();
    if (this.TYPE_LABELS[lowerType]) {
      return this.TYPE_LABELS[lowerType][lang];
    }
    // 尝试匹配部分类型（如 WEATHER -> weather_extreme）
    const normalizedType = this.normalizeRiskType(type);
    if (normalizedType && this.TYPE_LABELS[normalizedType]) {
      return this.TYPE_LABELS[normalizedType][lang];
    }
    return type;
  }

  /**
   * 标准化风险类型
   */
  private normalizeRiskType(type: string): string | null {
    const upperType = type.toUpperCase();
    // 映射常见的大写类型到标准类型
    const typeMap: Record<string, string> = {
      'WEATHER': 'weather_extreme',
      'TERRAIN': 'terrain',
      'WATER': 'water_safety',
      'WILDLIFE': 'wildlife',
      'CRIME': 'crime',
      'LOGISTICS': 'logistics_remote',
      'HEALTHCARE': 'healthcare_gap',
      'REGULATORY': 'regulatory',
    };
    return typeMap[upperType] || null;
  }

  /**
   * 获取风险类型分类
   */
  getCategory(type: string): 'weather' | 'terrain' | 'safety' | 'logistics' | 'other' {
    return this.TYPE_LABELS[type]?.category || 'other';
  }

  /**
   * 获取风险类型图标
   */
  getIcon(type: string): string {
    return this.TYPE_LABELS[type]?.icon || '⚠️';
  }

  /**
   * 获取风险类型说明
   */
  getTypeDescription(type: string, lang: 'en' | 'zh' = 'zh'): string {
    const key = lang === 'zh' ? 'description' : 'descriptionEn';
    return this.TYPE_LABELS[type]?.[key] || this.TYPE_LABELS[type]?.description || '';
  }

  /**
   * 获取严重程度标签
   */
  getSeverityLabel(severity: 'high' | 'medium' | 'low' | string, lang: 'en' | 'zh' = 'zh'): string {
    const normalizedSeverity = (severity === 'high' || severity === 'medium' || severity === 'low') 
      ? severity 
      : 'medium';
    const labels = {
      high: { zh: '高', en: 'High' },
      medium: { zh: '中', en: 'Medium' },
      low: { zh: '低', en: 'Low' },
    };
    return labels[normalizedSeverity]?.[lang] || severity;
  }

  /**
   * 增强风险信息
   */
  enhanceRisk(risk: {
    id: string;
    type: string;
    severity: string | 'high' | 'medium' | 'low';
    message?: string;
    summary?: string;
    mitigation?: string[];
    affectedPois?: any[];
    sources?: any[]; // 🆕 官方来源
  }, lang: 'en' | 'zh' = 'zh'): any {
    // 获取类型信息（支持大小写不敏感匹配）
    let typeInfo = this.TYPE_LABELS[risk.type];
    if (!typeInfo) {
      const lowerType = risk.type.toLowerCase();
      typeInfo = this.TYPE_LABELS[lowerType];
    }
    if (!typeInfo) {
      const normalizedType = this.normalizeRiskType(risk.type);
      if (normalizedType) {
        typeInfo = this.TYPE_LABELS[normalizedType];
      }
    }
    
    // 如果仍然找不到，使用默认值
    if (!typeInfo) {
      typeInfo = {
        zh: risk.type,
        en: risk.type,
        category: 'other' as const,
        icon: '⚠️',
        description: '',
      };
    }
    
    // 如果 message 和 summary 都为空，使用 typeDescription 作为默认描述
    const message = risk.message || risk.summary || typeInfo.description || '';
    const severity = (risk.severity === 'high' || risk.severity === 'medium' || risk.severity === 'low') 
      ? risk.severity 
      : 'medium' as 'high' | 'medium' | 'low';
    
    return {
      ...risk,
      // 类型信息
      typeLabel: typeInfo[lang] || risk.type,
      typeLabelEn: typeInfo.en || risk.type,
      category: typeInfo.category || 'other',
      typeIcon: typeInfo.icon || '⚠️',
      typeDescription: typeInfo.description || '',
      
      // 严重程度
      severityLabel: this.getSeverityLabel(severity, lang),
      severityLabelEn: this.getSeverityLabel(severity, 'en'),
      
      // 描述信息（如果原始message/summary为空，使用typeDescription）
      message: message || typeInfo.description || '',
      summary: risk.summary || typeInfo.description || '', // 保留summary字段
      description: message || typeInfo.description || '', // 详细说明
      impact: this.generateImpactDescription(risk, lang),
      
      // 缓解建议
      mitigation: risk.mitigation || [],
      
      // 🆕 保留官方来源（如果存在）
      sources: risk.sources || undefined,
      mitigationDetails: this.generateMitigationDetails(risk.mitigation || [], lang),
    };
  }

  /**
   * 生成影响说明
   */
  private generateImpactDescription(risk: any, lang: 'en' | 'zh'): string {
    if (risk.affectedPois && risk.affectedPois.length > 0) {
      return lang === 'zh' 
        ? `影响 ${risk.affectedPois.length} 个POI`
        : `Affects ${risk.affectedPois.length} POIs`;
    }
    return lang === 'zh' ? '可能影响行程执行' : 'May affect trip execution';
  }

  /**
   * 生成详细缓解建议
   */
  private generateMitigationDetails(
    mitigations: string[],
    lang: 'en' | 'zh'
  ): Array<{ action: string; priority: 'high' | 'medium' | 'low' }> {
    return mitigations.map((mitigation, index) => ({
      action: mitigation,
      priority: index === 0 ? 'high' : index === 1 ? 'medium' : 'low',
    }));
  }

  /**
   * 按分类分组风险
   */
  groupRisksByCategory(risks: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {
      weather: [],
      terrain: [],
      safety: [],
      logistics: [],
      other: [],
    };

    for (const risk of risks) {
      const category = risk.category || this.getCategory(risk.type);
      if (grouped[category]) {
        grouped[category].push(risk);
      } else {
        grouped.other.push(risk);
      }
    }

    return grouped;
  }
}
