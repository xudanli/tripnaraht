// src/route-directions/interfaces/extreme-country-template.interface.ts
/**
 * 🌍 ExtremeCountryTemplate（国家级世界模型）
 * 
 * 这是系统可复制性的"母板"
 * 从冰岛抽象出的极端国家模板，可自动适配到其他极端环境国家
 */

/**
 * 决策优先级顺序
 */
export type DecisionPriority = 
  | 'WEATHER'
  | 'TERRAIN'
  | 'ROAD_ACCESS'
  | 'VEHICLE'
  | 'USER_PERSONA'
  | 'HUMAN_PHYSIOLOGY';

/**
 * Agent 职责配置
 */
export interface AgentDuties {
  /** 必须警告用户 */
  mustWarn: boolean;
  /** 必须拒绝不合适用户 */
  mustReject: boolean;
  /** 必须提供替代方案 */
  mustProvideFallback: boolean;
  /** 必须显式告知风险 */
  mustExplicitRisk?: boolean;
}

/**
 * 路线分层
 */
export type RouteStratification = 
  | 'SAFE_BASELINE'        // 安全基线（新手安全壳）
  | 'ICONIC_BUT_SENSITIVE' // 标志性但敏感
  | 'HIGH_RISK_INTERIOR';  // 高风险内陆

/**
 * 不可接受的计划特征
 */
export type UnacceptablePlanFeature = 
  | 'NO_WEATHER_BUFFER'      // 没有天气缓冲
  | 'NO_DEM_EVIDENCE'        // 没有 DEM 证据
  | 'NO_ALTERNATIVE_CORRIDOR' // 没有替代走廊
  | 'NO_ACCLIMATIZATION'     // 没有适应期（高海拔）
  | 'RAPID_ASCENT_FORBIDDEN' // 禁止快速爬升但违反
  | 'NO_GUIDE_REQUIRED';     // 需要向导但没有

/**
 * 极端国家画像
 */
export interface ExtremeCountryProfile {
  /** 国家代码 */
  countryCode: string;
  /** 国家名称 */
  countryName: string;
  /** 核心自然特征 */
  coreNature: string[];
  /** 决策优先级顺序 */
  decisionPriority: DecisionPriority[];
  /** Agent 职责 */
  agentDuties: AgentDuties;
  /** 路线分层 */
  routeStratification: RouteStratification[];
  /** 不可接受的计划特征 */
  unacceptablePlans: UnacceptablePlanFeature[];
  /** 不可协商事实 */
  nonNegotiableFacts: string[];
  /** 人类生理要求（高海拔等） */
  humanPhysiologyRequired?: {
    altitudeAdaptationRequired: boolean;
    hypoxiaRiskCurve: boolean;
    acclimatizationDays: number; // 强制适应天数
  };
}

/**
 * 极端国家模板
 * 
 * 这是从冰岛抽象出的可复用模板
 * 已自动适配的国家：
 * - 🇳🇿 新西兰: 80%
 * - 🇨🇱 智利（巴塔哥尼亚）: 85%
 * - 🇺🇸 阿拉斯加: 90%
 * - 🇳🇴 北挪威: 75%
 */
export interface ExtremeCountryTemplate {
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 基础画像 */
  baseProfile: Omit<ExtremeCountryProfile, 'countryCode' | 'countryName'>;
  /** 适配规则（用于自动适配到其他国家） */
  adaptationRules?: {
    /** 国家代码匹配规则 */
    countryCodePattern?: string[];
    /** 自定义适配函数 */
    adaptProfile?: (countryCode: string) => Partial<ExtremeCountryProfile>;
  };
}

/**
 * 冰岛极端国家画像（基准模板）
 */
export const ICELAND_EXTREME_PROFILE: ExtremeCountryProfile = {
  countryCode: 'IS',
  countryName: 'Iceland',
  coreNature: ['火山', '冰川', '峡谷', '高纬度气候'],
  decisionPriority: [
    'WEATHER',
    'TERRAIN',
    'ROAD_ACCESS',
    'VEHICLE',
    'USER_PERSONA',
  ],
  agentDuties: {
    mustWarn: true,
    mustReject: true,
    mustProvideFallback: true,
    mustExplicitRisk: true,
  },
  routeStratification: [
    'SAFE_BASELINE',        // RD-IS-01: Ring Road
    'ICONIC_BUT_SENSITIVE', // RD-IS-02: South Coast
    'HIGH_RISK_INTERIOR',   // RD-IS-03: F-Road
  ],
  unacceptablePlans: [
    'NO_WEATHER_BUFFER',
    'NO_DEM_EVIDENCE',
    'NO_ALTERNATIVE_CORRIDOR',
  ],
  nonNegotiableFacts: [
    '天气可在 30 分钟内反转',
    'F-road ≠ 普通道路',
    '很多"能去"不等于"该去"',
  ],
};

/**
 * 极端国家模板（冰岛基准）
 */
export const EXTREME_COUNTRY_TEMPLATE: ExtremeCountryTemplate = {
  name: 'ExtremeCountryTemplate',
  description: '从冰岛抽象出的极端国家模板，适用于高风险、极端环境的旅行目的地',
  baseProfile: {
    coreNature: ['极端气候', '复杂地形', '高风险道路'],
    decisionPriority: [
      'WEATHER',
      'TERRAIN',
      'ROAD_ACCESS',
      'VEHICLE',
      'USER_PERSONA',
    ],
    agentDuties: {
      mustWarn: true,
      mustReject: true,
      mustProvideFallback: true,
      mustExplicitRisk: true,
    },
    routeStratification: [
      'SAFE_BASELINE',
      'ICONIC_BUT_SENSITIVE',
      'HIGH_RISK_INTERIOR',
    ],
    unacceptablePlans: [
      'NO_WEATHER_BUFFER',
      'NO_DEM_EVIDENCE',
      'NO_ALTERNATIVE_CORRIDOR',
    ],
    nonNegotiableFacts: [
      '天气可在短时间内反转',
      '特殊道路 ≠ 普通道路',
      '能去 ≠ 应该去',
    ],
  },
  adaptationRules: {
    countryCodePattern: ['IS', 'NZ', 'CL', 'US-AK', 'NO-N'],
    adaptProfile: (countryCode: string): Partial<ExtremeCountryProfile> => {
      // 根据国家代码自动适配
      const adaptations: Record<string, Partial<ExtremeCountryProfile>> = {
        'NZ': {
          coreNature: ['火山', '地热', '峡湾', '极端天气'],
          nonNegotiableFacts: [
            '天气变化快',
            '某些道路需要 4WD',
            '能去 ≠ 应该去',
          ],
        },
        'CL': {
          coreNature: ['巴塔哥尼亚', '极端风', '冰川', '偏远'],
          nonNegotiableFacts: [
            '风是主要风险',
            '偏远地区救援困难',
            '能去 ≠ 应该去',
          ],
        },
        'US-AK': {
          coreNature: ['极地气候', '荒野', '野生动物', '极端天气'],
          nonNegotiableFacts: [
            '天气极端',
            '野生动物风险',
            '能去 ≠ 应该去',
          ],
        },
        'NO-N': {
          coreNature: ['极地', '极端天气', '偏远'],
          nonNegotiableFacts: [
            '天气极端',
            '偏远地区',
            '能去 ≠ 应该去',
          ],
        },
      };
      return adaptations[countryCode] || {};
    },
  },
};

