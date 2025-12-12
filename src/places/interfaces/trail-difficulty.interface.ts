// src/places/interfaces/trail-difficulty.interface.ts

/**
 * 徒步难度元数据接口
 * 
 * Track A: Trail Difficulty（是否"难"）
 * 
 * 核心定义：
 * 「在当前条件下，一个目标人群是否可能遭遇超出预期的风险或技术门槛」
 * 
 * Difficulty = 风险 × 技术 × 不可逆性
 * 
 * ⚠️ 重要原则：
 * - 不是"累不累"（那是 Fatigue）
 * - 不是"走多久"（那是时间）
 * - 是"可能危险"的警告信号
 * - 宁可保守，不可乐观（偏向 false positive）
 */
export interface TrailDifficultyMetadata {
  /** 难度等级（1-5 星） */
  level: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
  
  /** 技术等级（1-5，5 为最高技术要求） */
  technicalGrade?: number;
  
  /** 风险因素（只允许：技术动作、地形不可逆、季节风险） */
  riskFactors?: RiskFactor[];
  
  /** 是否需要专业装备 */
  requiresEquipment?: boolean;
  
  /** 是否需要向导 */
  requiresGuide?: boolean;
  
  /** 数据来源 */
  source?: 'alltrails' | 'komoot' | 'official' | 'community' | 'manual';
  
  /** 置信度（0-1） */
  confidence?: number;
  
  /** 解释因子（为什么是这个难度） */
  explanations?: string[];
  
  /** 季节修正（运行时叠加，不污染 POI 本体） */
  seasonalModifier?: SeasonalModifier;
}

/**
 * 风险因素类型（只允许这些进入 Difficulty）
 */
export type RiskFactor =
  // 技术动作
  | 'scramble'      // 攀爬
  | 'rope'          // 需要绳索
  | 'exposure'      // 暴露感（悬崖）
  | 'technical'     // 技术路段
  // 地形不可逆
  | 'cliff'         // 陡崖
  | 'ice'           // 冰雪
  | 'loose_rock'    // 碎石
  | 'unstable'      // 不稳定地形
  // 季节风险
  | 'winter_ice'    // 冬季结冰
  | 'rain_loose'    // 雨季碎石松动
  | 'snow'          // 雪
  | 'melt_water';   // 融水

/**
 * 季节修正
 */
export interface SeasonalModifier {
  season: 'winter' | 'spring' | 'summer' | 'autumn';
  modifier: number;  // 难度修正（+1 表示提升 1 星）
  reason: string;   // 修正原因
}

/**
 * 难度等级映射
 */
export const DIFFICULTY_LEVEL = {
  EASY: 'EASY',        // ⭐
  MODERATE: 'MODERATE', // ⭐⭐
  HARD: 'HARD',        // ⭐⭐⭐
  EXTREME: 'EXTREME',  // ⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐
} as const;

export type DifficultyLevel = typeof DIFFICULTY_LEVEL[keyof typeof DIFFICULTY_LEVEL];

/**
 * 难度星级的真实语义（给系统用）
 */
export const DIFFICULTY_SEMANTICS: Record<DifficultyLevel, {
  stars: string;
  meaning: string;
  riskLevel: 'low' | 'medium' | 'high' | 'very_high' | 'extreme';
}> = {
  [DIFFICULTY_LEVEL.EASY]: {
    stars: '⭐',
    meaning: '几乎无风险，新手可随时撤退',
    riskLevel: 'low',
  },
  [DIFFICULTY_LEVEL.MODERATE]: {
    stars: '⭐⭐',
    meaning: '有地形变化，但直觉可应对',
    riskLevel: 'medium',
  },
  [DIFFICULTY_LEVEL.HARD]: {
    stars: '⭐⭐⭐',
    meaning: '需要经验判断，错误会不舒服',
    riskLevel: 'high',
  },
  [DIFFICULTY_LEVEL.EXTREME]: {
    stars: '⭐⭐⭐⭐ / ⭐⭐⭐⭐⭐',
    meaning: '错误可能导致严重后果（fall / lost / exposure）',
    riskLevel: 'extreme',
  },
};

/**
 * 难度到疲劳的调制系数（弱耦合）
 * 
 * 注意：这只是微调（5-15%），不能决定疲劳的主量级
 */
export const DIFFICULTY_FATIGUE_MODIFIER: Record<DifficultyLevel, number> = {
  [DIFFICULTY_LEVEL.EASY]: 0.95,      // -5%
  [DIFFICULTY_LEVEL.MODERATE]: 1.0,   // 基准
  [DIFFICULTY_LEVEL.HARD]: 1.1,       // +10%
  [DIFFICULTY_LEVEL.EXTREME]: 1.15,  // +15%
};

/**
 * 用户经验修正（Persona 分层）
 */
export interface ExperienceModifier {
  /** 用户经验等级 */
  experience: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  
  /** 难度修正（+1 表示提升 1 星，-1 表示降低 1 星） */
  modifier: number;
  
  /** 修正原因 */
  reason: string;
}

/**
 * 经验修正映射
 */
export const EXPERIENCE_MODIFIER: Record<ExperienceModifier['experience'], number> = {
  beginner: +1,      // 新手：+1 星（更保守）
  intermediate: 0,   // 中级：不变
  advanced: -0.5,    // 高级：-0.5 星
  expert: -1,        // 专家：-1 星
};
