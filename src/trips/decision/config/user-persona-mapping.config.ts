// src/trips/decision/config/user-persona-mapping.config.ts
/**
 * 用户画像 → DecisionParams 映射配置表
 * 
 * 将用户的自然语言描述映射到系统决策参数
 * 先写死在配置里，后面再学习化
 */

import { DecisionParams } from '../shared/world-model.types';

/**
 * 用户画像关键词组合
 */
export interface UserPersonaKeywords {
  pace?: ('slow' | 'relaxed' | 'normal' | 'fast' | 'intense')[];
  preferences?: ('photography' | 'hiking' | 'culture' | 'nature' | 'adventure' | 'comfort')[];
  riskTolerance?: ('low' | 'medium' | 'high')[];
  fitness?: ('low' | 'medium' | 'high' | 'extreme')[];
}

/**
 * 用户画像映射规则
 */
export interface UserPersonaMappingRule {
  /** 匹配关键词 */
  keywords: UserPersonaKeywords;
  /** 映射到的决策参数 */
  decisionParams: Partial<DecisionParams>;
  /** 描述 */
  description: string;
}

/**
 * 用户画像映射配置表
 */
export const USER_PERSONA_MAPPING_CONFIG: UserPersonaMappingRule[] = [
  // 慢节奏 + 摄影
  {
    keywords: {
      pace: ['slow', 'relaxed'],
      preferences: ['photography'],
    },
    decisionParams: {
      maxDailyAscentM: 600,
      rollingAscent3DaysM: 1500,
      maxSlopePct: 20,
      weatherRiskWeight: 0.6, // 摄影对天气敏感
      bufferDayBias: 'HIGH',
      riskTolerance: 'LOW',
    },
    description: '慢节奏+摄影：低爬升、高缓冲、天气敏感',
  },

  // 强体能徒步
  {
    keywords: {
      fitness: ['high', 'extreme'],
      preferences: ['hiking', 'adventure'],
    },
    decisionParams: {
      maxDailyAscentM: 1200,
      rollingAscent3DaysM: 3000,
      maxSlopePct: 30,
      weatherRiskWeight: 0.4,
      bufferDayBias: 'LOW',
      riskTolerance: 'HIGH',
    },
    description: '强体能徒步：高爬升、低缓冲、高风险容忍',
  },

  // 文化探索 + 舒适
  {
    keywords: {
      preferences: ['culture', 'comfort'],
      pace: ['relaxed', 'normal'],
    },
    decisionParams: {
      maxDailyAscentM: 400,
      rollingAscent3DaysM: 1000,
      maxSlopePct: 15,
      weatherRiskWeight: 0.5,
      bufferDayBias: 'MEDIUM',
      riskTolerance: 'LOW',
    },
    description: '文化探索+舒适：极低爬升、中等缓冲、低风险',
  },

  // 自然探索 + 中等节奏
  {
    keywords: {
      preferences: ['nature'],
      pace: ['normal'],
      fitness: ['medium'],
    },
    decisionParams: {
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      weatherRiskWeight: 0.5,
      bufferDayBias: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    },
    description: '自然探索+中等节奏：中等爬升、中等缓冲',
  },

  // 冒险 + 快节奏
  {
    keywords: {
      preferences: ['adventure'],
      pace: ['fast', 'intense'],
      riskTolerance: ['high'],
    },
    decisionParams: {
      maxDailyAscentM: 1000,
      rollingAscent3DaysM: 2500,
      maxSlopePct: 28,
      weatherRiskWeight: 0.3, // 冒险对天气容忍度高
      bufferDayBias: 'LOW',
      riskTolerance: 'HIGH',
    },
    description: '冒险+快节奏：高爬升、低缓冲、高风险容忍',
  },

  // 默认配置（中等用户）
  {
    keywords: {},
    decisionParams: {
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 25,
      weatherRiskWeight: 0.5,
      bufferDayBias: 'MEDIUM',
      riskTolerance: 'MEDIUM',
    },
    description: '默认配置：中等爬升、中等缓冲、中等风险容忍',
  },
];

/**
 * 根据用户画像关键词匹配决策参数
 */
export function mapUserPersonaToDecisionParams(
  keywords: UserPersonaKeywords
): DecisionParams {
  // 找到最匹配的规则
  let bestMatch: UserPersonaMappingRule | null = null;
  let bestScore = 0;

  for (const rule of USER_PERSONA_MAPPING_CONFIG) {
    if (Object.keys(rule.keywords).length === 0) {
      // 默认规则，作为兜底
      if (!bestMatch) {
        bestMatch = rule;
      }
      continue;
    }

    let score = 0;
    let totalFields = 0;

    // 计算匹配分数
    if (rule.keywords.pace && keywords.pace) {
      totalFields++;
      if (rule.keywords.pace.some(p => keywords.pace?.includes(p))) {
        score++;
      }
    }

    if (rule.keywords.preferences && keywords.preferences) {
      totalFields++;
      if (rule.keywords.preferences.some(p => keywords.preferences?.includes(p))) {
        score++;
      }
    }

    if (rule.keywords.riskTolerance && keywords.riskTolerance) {
      totalFields++;
      if (rule.keywords.riskTolerance.some(r => keywords.riskTolerance?.includes(r))) {
        score++;
      }
    }

    if (rule.keywords.fitness && keywords.fitness) {
      totalFields++;
      if (rule.keywords.fitness.some(f => keywords.fitness?.includes(f))) {
        score++;
      }
    }

    // 计算匹配率
    const matchRate = totalFields > 0 ? score / totalFields : 0;

    if (matchRate > bestScore) {
      bestScore = matchRate;
      bestMatch = rule;
    }
  }

  // 使用最佳匹配的决策参数，合并默认值
  const defaultParams: DecisionParams = {
    maxDailyAscentM: 800,
    rollingAscent3DaysM: 2000,
    maxSlopePct: 25,
    weatherRiskWeight: 0.5,
    bufferDayBias: 'MEDIUM',
    riskTolerance: 'MEDIUM',
  };

  return {
    ...defaultParams,
    ...(bestMatch?.decisionParams || {}),
  };
}

/**
 * 从用户偏好中提取关键词
 */
export function extractPersonaKeywordsFromPreferences(
  preferences: {
    pace?: string;
    preferences?: string[];
    riskTolerance?: string;
    fitness?: string;
  }
): UserPersonaKeywords {
  const keywords: UserPersonaKeywords = {};

  // 提取节奏
  if (preferences.pace) {
    const paceLower = preferences.pace.toLowerCase();
    if (paceLower.includes('slow') || paceLower.includes('relaxed')) {
      keywords.pace = ['slow', 'relaxed'];
    } else if (paceLower.includes('fast') || paceLower.includes('intense')) {
      keywords.pace = ['fast', 'intense'];
    } else {
      keywords.pace = ['normal'];
    }
  }

  // 提取偏好
  if (preferences.preferences && preferences.preferences.length > 0) {
    keywords.preferences = preferences.preferences.map(p => {
      const pLower = p.toLowerCase();
      if (pLower.includes('摄影') || pLower.includes('photo')) return 'photography';
      if (pLower.includes('徒步') || pLower.includes('hiking')) return 'hiking';
      if (pLower.includes('文化') || pLower.includes('culture')) return 'culture';
      if (pLower.includes('自然') || pLower.includes('nature')) return 'nature';
      if (pLower.includes('冒险') || pLower.includes('adventure')) return 'adventure';
      if (pLower.includes('舒适') || pLower.includes('comfort')) return 'comfort';
      return null;
    }).filter((p): p is NonNullable<typeof p> => p !== null);
  }

  // 提取风险容忍度
  if (preferences.riskTolerance) {
    const rtLower = preferences.riskTolerance.toLowerCase();
    if (rtLower.includes('low')) {
      keywords.riskTolerance = ['low'];
    } else if (rtLower.includes('high')) {
      keywords.riskTolerance = ['high'];
    } else {
      keywords.riskTolerance = ['medium'];
    }
  }

  // 提取体能
  if (preferences.fitness) {
    const fitLower = preferences.fitness.toLowerCase();
    if (fitLower.includes('low')) {
      keywords.fitness = ['low'];
    } else if (fitLower.includes('high') || fitLower.includes('extreme')) {
      keywords.fitness = ['high', 'extreme'];
    } else {
      keywords.fitness = ['medium'];
    }
  }

  return keywords;
}

