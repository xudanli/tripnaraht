// src/trips/decision/models/human-capability.model.ts
/**
 * Human Capability Model（人体能力模型）
 * 
 * 第一性原理：单日可承受爬升、连续滚动爬升、最大坡度、高海拔适应度、风险承受度、节奏偏好
 * 
 * DecisionParams 是从这个模型投影出来的
 * 
 * Phase 1 改进（2026-02）：
 * - 增加年龄修正系数
 * - 增加体能评分和置信度
 * - 支持标准化问卷评估
 * - 支持历史行程校准
 */

/**
 * 节奏偏好
 */
export type PreferredPace = 'SLOW' | 'MEDIUM' | 'FAST';

/**
 * 风险承受度
 */
export type RiskTolerance = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 高海拔经验
 */
export type HighAltitudeExperience = 'NONE' | 'BASIC' | 'ADVANCED';

/**
 * 体能评估来源
 */
export type FitnessAssessmentSource = 
  | 'QUESTIONNAIRE'    // 标准化问卷
  | 'HISTORICAL'       // 历史行程校准
  | 'WEARABLE'         // 可穿戴设备
  | 'FIRST_DAY_TEST'   // 首日轻量测试
  | 'USER_SELF_REPORT' // 用户自评（旧方式）
  | 'DEFAULT';         // 默认值

/**
 * 置信度等级
 */
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

/**
 * 细粒度体能等级（5档）
 */
export type FitnessLevel = 'LOW' | 'MEDIUM_LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH';

/**
 * 年龄段
 */
export type AgeGroup = '18-29' | '30-39' | '40-49' | '50-59' | '60+';

/**
 * 高海拔适应状态
 * 
 * Phase 2 改进（2026-02）：
 * 基于高海拔医学研究，人体需要时间适应低氧环境
 * - 2500m+：开始需要适应
 * - 3000m+：每上升300m需要额外1天适应
 * - 4000m+：每上升200m需要额外1天适应
 */
export interface AcclimatizationState {
  /** 当前已适应的最高海拔（米） */
  acclimatizedAltitudeM: number;
  /** 在当前海拔停留的天数 */
  daysAtCurrentAltitude: number;
  /** 累积适应天数 */
  totalAcclimatizationDays: number;
  /** 适应效率（0-1，受年龄、体能影响） */
  acclimatizationEfficiency: number;
  /** 是否出现高反症状 */
  hasAMSSymptoms?: boolean;
  /** 上次海拔变化日期 */
  lastAltitudeChangeDate?: Date;
}

/**
 * 高海拔适应规则
 */
export interface AcclimatizationRule {
  /** 海拔阈值（米） */
  altitudeThresholdM: number;
  /** 每上升多少米需要1天适应 */
  metersPerAcclimatizationDay: number;
  /** 最大单日海拔增益（睡眠海拔） */
  maxDailySleepingAltitudeGainM: number;
}

/**
 * 标准化体能问卷答案
 */
export interface FitnessQuestionnaireAnswers {
  /** 每周运动习惯（0-4） */
  weeklyExercise: 0 | 1 | 2 | 3 | 4;
  /** 最长单日徒步距离（0-4） */
  longestHike: 0 | 1 | 2 | 3 | 4;
  /** 最大单日爬升经验（0-4） */
  elevationExperience: 0 | 1 | 2 | 3 | 4;
  /** 年龄段 */
  ageGroup: AgeGroup;
}

/**
 * 行程后体能反馈
 */
export interface TripFitnessFeedback {
  /** 行程ID */
  tripId: string;
  /** 用户ID */
  userId: string;
  /** 系统预估的疲劳指数 */
  plannedFatigueIndex: number;
  /** 用户实际感受（emoji 反馈）：1=太累了, 2=刚刚好, 3=还能再走 */
  actualEffortRating: 1 | 2 | 3;
  /** 是否按计划完成 */
  completedAsPlanned: boolean;
  /** 实际做了哪些调整 */
  adjustmentsMade?: string[];
  /** 反馈时间 */
  feedbackAt: Date;
}

/**
 * 体能校准历史记录
 */
export interface CalibrationRecord {
  /** 校准日期 */
  date: Date;
  /** 校准因子 */
  factor: number;
  /** 参与校准的反馈数量 */
  feedbackCount: number;
  /** 校准来源 */
  source: FitnessAssessmentSource;
}

/**
 * 人体能力模型
 * 
 * 对应第一性原理：
 * - 单日可承受爬升
 * - 连续 3–5 天滚动爬升
 * - 最大可接受坡度
 * - 高海拔适应度
 * - 风险承受度
 * - 节奏偏好（慢游 / 刺激 / 中性）
 */
export interface HumanCapabilityModel {
  /** 用户画像 ID（静态 or 画像 + 历史学习） */
  profileId: string;

  /** 单日最大爬升（米） */
  maxDailyAscentM: number;

  /** 连续 3 天滚动爬升阈值（米） */
  rollingAscent3DaysM: number;

  /** 最大可接受坡度（百分比） */
  maxSlopePct: number;

  /** 节奏偏好 */
  preferredPace: PreferredPace;

  /** 风险承受度 */
  riskTolerance: RiskTolerance;

  /** 高海拔经验 */
  highAltitudeExperience: HighAltitudeExperience;

  /** 最大海拔（米，基于高海拔经验） */
  maxElevationM?: number;

  /** 是否需要渐进适应（高海拔） */
  requiresGradualAscent?: boolean;

  /** 缓冲日偏好（LOW/MEDIUM/HIGH） */
  bufferDayBias?: 'LOW' | 'MEDIUM' | 'HIGH';

  /** 天气风险权重（0-1，越高越敏感） */
  weatherRiskWeight?: number;

  // ========== Phase 1 新增字段 ==========

  /** 用户年龄 */
  age?: number;

  /** 年龄段（用于问卷） */
  ageGroup?: AgeGroup;

  /** 年龄修正系数（0.6-1.0，40岁后每10年降低约10%） */
  ageModifier?: number;

  /** 体能评分（0-100，来自问卷或校准） */
  fitnessScore?: number;

  /** 细粒度体能等级 */
  fitnessLevel?: FitnessLevel;

  /** 评估来源 */
  assessmentSource?: FitnessAssessmentSource;

  /** 置信度等级 */
  confidenceLevel?: ConfidenceLevel;

  /** 已完成的行程数量（用于计算置信度） */
  completedTripCount?: number;

  /** 当前状态修正系数（0.7-1.3，基于近期状态） */
  currentConditionModifier?: number;

  /** 校准历史 */
  calibrationHistory?: CalibrationRecord[];

  // ========== Phase 2 高海拔适应字段 ==========

  /** 高海拔适应状态 */
  acclimatizationState?: AcclimatizationState;

  /** 适应速率修正（0.7-1.3，基于个人体质） */
  acclimatizationRateModifier?: number;

  /** 高反敏感度（LOW/MEDIUM/HIGH） */
  amsSensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';

  /** 元数据（用于扩展） */
  metadata?: Record<string, any>;
}

/**
 * 年龄修正系数计算
 * 
 * 基于运动科学：40岁后体能每10年下降约10%
 * 
 * @param age 用户年龄
 * @returns 年龄修正系数（0.6-1.0）
 */
export function calculateAgeModifier(age: number): number {
  if (age <= 25) return 1.0;
  if (age <= 35) return 0.95;
  if (age <= 45) return 0.90;
  if (age <= 55) return 0.80;
  if (age <= 65) return 0.70;
  return 0.60;
}

/**
 * 年龄段转换为中位年龄
 */
export function ageGroupToMidAge(ageGroup: AgeGroup): number {
  const mapping: Record<AgeGroup, number> = {
    '18-29': 24,
    '30-39': 35,
    '40-49': 45,
    '50-59': 55,
    '60+': 65,
  };
  return mapping[ageGroup];
}

/**
 * 问卷评分到体能等级映射
 */
export function questionnaireScoreToFitnessLevel(score: number): FitnessLevel {
  // score 范围：0-100
  if (score < 30) return 'LOW';
  if (score < 45) return 'MEDIUM_LOW';
  if (score < 60) return 'MEDIUM';
  if (score < 80) return 'MEDIUM_HIGH';
  return 'HIGH';
}

/**
 * 体能等级到基础爬升能力映射
 */
/**
 * 体能等级到基础爬升能力映射
 * 
 * Phase 2 改进：
 * - HIGH 级别 3 天滚动爬升从 3000m 提高到 3300m（比例从 2.5x 提高到 2.75x）
 * - 增加 ELITE 级别支持（通过 metadata 扩展）
 */
export function fitnessLevelToBaseAscent(level: FitnessLevel): {
  maxDailyAscentM: number;
  rollingAscent3DaysM: number;
  maxSlopePct: number;
} {
  const mapping: Record<FitnessLevel, { maxDailyAscentM: number; rollingAscent3DaysM: number; maxSlopePct: number }> = {
    'LOW': { maxDailyAscentM: 400, rollingAscent3DaysM: 1000, maxSlopePct: 15 },
    'MEDIUM_LOW': { maxDailyAscentM: 600, rollingAscent3DaysM: 1500, maxSlopePct: 20 },
    'MEDIUM': { maxDailyAscentM: 800, rollingAscent3DaysM: 2000, maxSlopePct: 25 },
    'MEDIUM_HIGH': { maxDailyAscentM: 1000, rollingAscent3DaysM: 2600, maxSlopePct: 28 }, // Phase 2: 2500 → 2600
    'HIGH': { maxDailyAscentM: 1200, rollingAscent3DaysM: 3300, maxSlopePct: 30 },        // Phase 2: 3000 → 3300
  };
  return mapping[level];
}

/**
 * 计算置信度等级
 * 
 * 基于已完成行程数量和评估来源
 */
export function calculateConfidenceLevel(
  tripCount: number,
  source: FitnessAssessmentSource
): ConfidenceLevel {
  // 可穿戴设备数据置信度最高
  if (source === 'WEARABLE') return 'HIGH';
  
  // 历史行程校准
  if (source === 'HISTORICAL' && tripCount >= 3) return 'HIGH';
  if (source === 'HISTORICAL' && tripCount >= 1) return 'MEDIUM';
  
  // 首日测试
  if (source === 'FIRST_DAY_TEST') return 'MEDIUM';
  
  // 问卷
  if (source === 'QUESTIONNAIRE') return 'MEDIUM';
  
  // 用户自评和默认值
  return 'LOW';
}

/**
 * 驾驶疲劳偏好（与 UserTravelProfile.drivingFatiguePreferences 兼容）
 */
export interface DrivingFatiguePreferencesInput {
  sleepQuality?: 'adequate' | 'short' | 'poor' | 'very_poor';
  breakHabit?: 'regular' | 'sometimes' | 'rarely' | 'none';
  stressLevel?: 'low' | 'medium' | 'high';
}

const SLEEP_FACTOR_MAP: Record<string, number> = {
  adequate: 1.0,
  short: 0.85,
  poor: 0.7,
  very_poor: 0.5,
};
const BREAK_FACTOR_MAP: Record<string, number> = {
  regular: 1.0,
  sometimes: 0.9,
  rarely: 0.7,
  none: 0.7,
};
const STRESS_FACTOR_MAP: Record<string, number> = {
  low: 1.0,
  medium: 0.9,
  high: 0.8,
};

function mapDrivingFatigueToFactors(
  prefs?: DrivingFatiguePreferencesInput
): { sleepFactor: number; breakFactor: number; stressFactor: number } | undefined {
  if (!prefs || (!prefs.sleepQuality && !prefs.breakHabit && !prefs.stressLevel)) return undefined;
  return {
    sleepFactor: prefs.sleepQuality ? (SLEEP_FACTOR_MAP[prefs.sleepQuality] ?? 1.0) : 1.0,
    breakFactor: prefs.breakHabit ? (BREAK_FACTOR_MAP[prefs.breakHabit] ?? 1.0) : 1.0,
    stressFactor: prefs.stressLevel ? (STRESS_FACTOR_MAP[prefs.stressLevel] ?? 1.0) : 1.0,
  };
}

/**
 * 从用户画像关键词生成人体能力模型（旧方式，兼容保留）
 * 
 * @deprecated 建议使用 createHumanCapabilityModelFromQuestionnaire
 */
export function createHumanCapabilityModelFromProfile(
  profileId: string,
  keywords: {
    pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    fitness?: 'low' | 'medium' | 'high' | 'extreme';
    riskTolerance?: 'low' | 'medium' | 'high';
    highAltitudeExperience?: 'none' | 'basic' | 'advanced';
    drivingFatiguePreferences?: DrivingFatiguePreferencesInput;
  }
): HumanCapabilityModel {
  // 根据关键词映射到能力参数
  const pace = keywords.pace || 'normal';
  const fitness = keywords.fitness || 'medium';
  const riskTolerance = keywords.riskTolerance || 'medium';
  const altitudeExp = keywords.highAltitudeExperience || 'none';

  // 节奏偏好映射
  let preferredPace: PreferredPace = 'MEDIUM';
  if (pace === 'slow' || pace === 'relaxed') {
    preferredPace = 'SLOW';
  } else if (pace === 'fast' || pace === 'intense') {
    preferredPace = 'FAST';
  }

  // 体能 → 爬升能力映射
  let maxDailyAscentM = 800; // 默认中等
  let rollingAscent3DaysM = 2000;
  let maxSlopePct = 25;

  if (fitness === 'low') {
    maxDailyAscentM = 400;
    rollingAscent3DaysM = 1000;
    maxSlopePct = 15;
  } else if (fitness === 'high' || fitness === 'extreme') {
    maxDailyAscentM = 1200;
    rollingAscent3DaysM = 3000;
    maxSlopePct = 30;
  }

  // 风险承受度映射
  let riskToleranceLevel: RiskTolerance = 'MEDIUM';
  if (riskTolerance === 'low') {
    riskToleranceLevel = 'LOW';
  } else if (riskTolerance === 'high') {
    riskToleranceLevel = 'HIGH';
  }

  // 高海拔经验映射
  let highAltitudeExp: HighAltitudeExperience = 'NONE';
  if (altitudeExp === 'basic') {
    highAltitudeExp = 'BASIC';
  } else if (altitudeExp === 'advanced') {
    highAltitudeExp = 'ADVANCED';
  }

  // 高海拔经验 → 最大海拔映射
  let maxElevationM: number | undefined;
  let requiresGradualAscent = false;
  if (highAltitudeExp === 'NONE') {
    maxElevationM = 3000;
    requiresGradualAscent = true;
  } else if (highAltitudeExp === 'BASIC') {
    maxElevationM = 4500;
    requiresGradualAscent = true;
  } else if (highAltitudeExp === 'ADVANCED') {
    maxElevationM = 6000;
    requiresGradualAscent = false;
  }

  // 缓冲日偏好（基于节奏和体能）
  let bufferDayBias: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (preferredPace === 'SLOW' || fitness === 'low') {
    bufferDayBias = 'HIGH';
  } else if (preferredPace === 'FAST' && fitness === 'high') {
    bufferDayBias = 'LOW';
  }

  // 天气风险权重（基于风险承受度）
  let weatherRiskWeight = 0.5;
  if (riskToleranceLevel === 'LOW') {
    weatherRiskWeight = 0.7;
  } else if (riskToleranceLevel === 'HIGH') {
    weatherRiskWeight = 0.3;
  }

  const drivingFatigueFactors = mapDrivingFatigueToFactors(keywords.drivingFatiguePreferences);

  return {
    profileId,
    maxDailyAscentM,
    rollingAscent3DaysM,
    maxSlopePct,
    preferredPace,
    riskTolerance: riskToleranceLevel,
    highAltitudeExperience: highAltitudeExp,
    maxElevationM,
    requiresGradualAscent,
    bufferDayBias,
    weatherRiskWeight,
    // Phase 1: 标记为旧方式，置信度低
    assessmentSource: 'USER_SELF_REPORT',
    confidenceLevel: 'LOW',
    ...(drivingFatigueFactors && {
      metadata: { drivingFatigueFactors },
    }),
  };
}

/**
 * 从标准化问卷生成人体能力模型（推荐方式）
 * 
 * Phase 1 核心改进：
 * 1. 使用标准化问卷替代主观自评
 * 2. 加入年龄修正系数
 * 3. 计算置信度
 */
export function createHumanCapabilityModelFromQuestionnaire(
  profileId: string,
  questionnaire: FitnessQuestionnaireAnswers,
  options?: {
    riskTolerance?: 'low' | 'medium' | 'high';
    highAltitudeExperience?: 'none' | 'basic' | 'advanced';
    pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    completedTripCount?: number;
  }
): HumanCapabilityModel {
  // 1. 计算问卷评分（0-100）
  const fitnessScore = calculateQuestionnaireScore(questionnaire);
  
  // 2. 映射到体能等级
  const fitnessLevel = questionnaireScoreToFitnessLevel(fitnessScore);
  
  // 3. 获取基础爬升能力
  const baseCapacity = fitnessLevelToBaseAscent(fitnessLevel);
  
  // 4. 计算年龄修正系数
  const midAge = ageGroupToMidAge(questionnaire.ageGroup);
  const ageModifier = calculateAgeModifier(midAge);
  
  // 5. 应用年龄修正到爬升能力
  const maxDailyAscentM = Math.round(baseCapacity.maxDailyAscentM * ageModifier);
  const rollingAscent3DaysM = Math.round(baseCapacity.rollingAscent3DaysM * ageModifier);
  
  // 6. 处理其他参数
  const riskTolerance = options?.riskTolerance || 'medium';
  const altitudeExp = options?.highAltitudeExperience || 'none';
  const pace = options?.pace || 'normal';
  
  // 节奏偏好映射
  let preferredPace: PreferredPace = 'MEDIUM';
  if (pace === 'slow' || pace === 'relaxed') {
    preferredPace = 'SLOW';
  } else if (pace === 'fast' || pace === 'intense') {
    preferredPace = 'FAST';
  }
  
  // 风险承受度映射
  let riskToleranceLevel: RiskTolerance = 'MEDIUM';
  if (riskTolerance === 'low') {
    riskToleranceLevel = 'LOW';
  } else if (riskTolerance === 'high') {
    riskToleranceLevel = 'HIGH';
  }
  
  // 高海拔经验映射
  let highAltitudeExp: HighAltitudeExperience = 'NONE';
  let maxElevationM: number | undefined;
  let requiresGradualAscent = false;
  
  if (altitudeExp === 'basic') {
    highAltitudeExp = 'BASIC';
    maxElevationM = 4500;
    requiresGradualAscent = true;
  } else if (altitudeExp === 'advanced') {
    highAltitudeExp = 'ADVANCED';
    maxElevationM = 6000;
    requiresGradualAscent = false;
  } else {
    maxElevationM = 3000;
    requiresGradualAscent = true;
  }
  
  // 缓冲日偏好（基于节奏和体能等级）
  let bufferDayBias: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';
  if (preferredPace === 'SLOW' || fitnessLevel === 'LOW' || fitnessLevel === 'MEDIUM_LOW') {
    bufferDayBias = 'HIGH';
  } else if (preferredPace === 'FAST' && (fitnessLevel === 'HIGH' || fitnessLevel === 'MEDIUM_HIGH')) {
    bufferDayBias = 'LOW';
  }
  
  // 天气风险权重
  let weatherRiskWeight = 0.5;
  if (riskToleranceLevel === 'LOW') {
    weatherRiskWeight = 0.7;
  } else if (riskToleranceLevel === 'HIGH') {
    weatherRiskWeight = 0.3;
  }
  
  // 7. 计算置信度
  const completedTripCount = options?.completedTripCount || 0;
  const confidenceLevel = calculateConfidenceLevel(completedTripCount, 'QUESTIONNAIRE');
  
  return {
    profileId,
    maxDailyAscentM,
    rollingAscent3DaysM,
    maxSlopePct: baseCapacity.maxSlopePct,
    preferredPace,
    riskTolerance: riskToleranceLevel,
    highAltitudeExperience: highAltitudeExp,
    maxElevationM,
    requiresGradualAscent,
    bufferDayBias,
    weatherRiskWeight,
    // Phase 1 新字段
    age: midAge,
    ageGroup: questionnaire.ageGroup,
    ageModifier,
    fitnessScore,
    fitnessLevel,
    assessmentSource: 'QUESTIONNAIRE',
    confidenceLevel,
    completedTripCount,
  };
}

/**
 * 计算标准化问卷评分
 * 
 * 评分维度和权重：
 * - 每周运动习惯：30%
 * - 最长单日徒步距离：35%
 * - 最大爬升经验：35%
 */
export function calculateQuestionnaireScore(answers: FitnessQuestionnaireAnswers): number {
  // 每个问题的得分映射（0-4 → 0-100）
  const weeklyExerciseScore = answers.weeklyExercise * 25; // 0, 25, 50, 75, 100
  const longestHikeScore = answers.longestHike * 25;
  const elevationScore = answers.elevationExperience * 25;
  
  // 加权计算
  const totalScore = 
    weeklyExerciseScore * 0.30 +
    longestHikeScore * 0.35 +
    elevationScore * 0.35;
  
  return Math.round(totalScore);
}

/**
 * 基于历史行程反馈校准人体能力模型
 * 
 * @param currentModel 当前模型
 * @param feedbacks 历史反馈数组
 * @returns 校准后的模型
 */
export function calibrateModelFromFeedback(
  currentModel: HumanCapabilityModel,
  feedbacks: TripFitnessFeedback[]
): HumanCapabilityModel {
  if (feedbacks.length === 0) {
    return currentModel;
  }
  
  // 分析预估 vs 实际的偏差
  // actualEffortRating: 1=太累了, 2=刚刚好, 3=还能再走
  // Phase 2 改进：扩大偏差系数范围，更快响应用户反馈
  // 转换为偏差系数：1 → -0.20, 2 → 0, 3 → +0.15
  let totalBias = 0;
  for (const feedback of feedbacks) {
    if (feedback.actualEffortRating === 1) {
      // 太累了 → 系统高估了用户能力，需要降低
      totalBias -= 0.20; // Phase 2: 从 -0.15 调整为 -0.20
    } else if (feedback.actualEffortRating === 3) {
      // 还能再走 → 系统低估了用户能力，可以提高
      totalBias += 0.15; // Phase 2: 从 +0.10 调整为 +0.15
    }
    // actualEffortRating === 2 (刚刚好) → 不调整
  }
  
  const avgBias = totalBias / feedbacks.length;
  
  // 计算调整因子（Phase 2: 扩大范围到 ±20%，更好地适应用户实际能力）
  const adjustmentFactor = Math.max(0.80, Math.min(1.20, 1 + avgBias));
  
  // 创建新的校准记录
  const newCalibrationRecord: CalibrationRecord = {
    date: new Date(),
    factor: adjustmentFactor,
    feedbackCount: feedbacks.length,
    source: 'HISTORICAL',
  };
  
  // 应用调整
  const calibratedModel: HumanCapabilityModel = {
    ...currentModel,
    maxDailyAscentM: Math.round(currentModel.maxDailyAscentM * adjustmentFactor),
    rollingAscent3DaysM: Math.round(currentModel.rollingAscent3DaysM * adjustmentFactor),
    // 更新元数据
    assessmentSource: 'HISTORICAL',
    confidenceLevel: calculateConfidenceLevel(
      (currentModel.completedTripCount || 0) + feedbacks.length,
      'HISTORICAL'
    ),
    completedTripCount: (currentModel.completedTripCount || 0) + feedbacks.length,
    calibrationHistory: [
      ...(currentModel.calibrationHistory || []),
      newCalibrationRecord,
    ],
  };
  
  return calibratedModel;
}

/**
 * 将 HumanCapabilityModel 投影为 DecisionParams
 */
export function projectToDecisionParams(
  model: HumanCapabilityModel
): import('../shared/world-model.types').DecisionParams {
  return {
    maxDailyAscentM: model.maxDailyAscentM,
    rollingAscent3DaysM: model.rollingAscent3DaysM,
    maxSlopePct: model.maxSlopePct,
    weatherRiskWeight: model.weatherRiskWeight || 0.5,
    bufferDayBias: model.bufferDayBias || 'MEDIUM',
    riskTolerance: model.riskTolerance,
    // maxElevationM 和 rapidAscentForbidden 不在 DecisionParams 中，跳过
  };
}

// ========== Phase 2 高海拔适应函数 ==========

/**
 * 获取高海拔适应规则
 * 
 * 基于"爬高睡低"原则和高海拔医学标准
 */
export function getAcclimatizationRules(): AcclimatizationRule[] {
  return [
    {
      altitudeThresholdM: 2500,
      metersPerAcclimatizationDay: 500,  // 2500-3000m：每500m需要1天
      maxDailySleepingAltitudeGainM: 500,
    },
    {
      altitudeThresholdM: 3000,
      metersPerAcclimatizationDay: 300,  // 3000-4000m：每300m需要1天
      maxDailySleepingAltitudeGainM: 400,
    },
    {
      altitudeThresholdM: 4000,
      metersPerAcclimatizationDay: 200,  // 4000m+：每200m需要1天
      maxDailySleepingAltitudeGainM: 300,
    },
    {
      altitudeThresholdM: 5000,
      metersPerAcclimatizationDay: 150,  // 5000m+：每150m需要1天
      maxDailySleepingAltitudeGainM: 200,
    },
  ];
}

/**
 * 计算高海拔适应效率
 * 
 * 受年龄、体能水平、高海拔经验影响
 * 
 * @param model 人体能力模型
 * @returns 适应效率系数（0.6-1.2）
 */
export function calculateAcclimatizationEfficiency(
  model: HumanCapabilityModel
): number {
  let efficiency = 1.0;

  // 1. 年龄影响（年轻人适应更快）
  const ageModifier = model.ageModifier || calculateAgeModifier(model.age || 35);
  efficiency *= 0.8 + ageModifier * 0.3; // 范围：0.98-1.1

  // 2. 体能水平影响
  const fitnessModifier: Record<FitnessLevel, number> = {
    'LOW': 0.85,
    'MEDIUM_LOW': 0.92,
    'MEDIUM': 1.0,
    'MEDIUM_HIGH': 1.05,
    'HIGH': 1.1,
  };
  efficiency *= fitnessModifier[model.fitnessLevel || 'MEDIUM'];

  // 3. 高海拔经验影响
  const experienceModifier: Record<HighAltitudeExperience, number> = {
    'NONE': 0.85,
    'BASIC': 1.0,
    'ADVANCED': 1.15,
  };
  efficiency *= experienceModifier[model.highAltitudeExperience];

  // 4. 高反敏感度影响
  if (model.amsSensitivity) {
    const sensitivityModifier: Record<string, number> = {
      'LOW': 1.1,
      'MEDIUM': 1.0,
      'HIGH': 0.8,
    };
    efficiency *= sensitivityModifier[model.amsSensitivity];
  }

  // 5. 应用个人适应速率修正
  if (model.acclimatizationRateModifier) {
    efficiency *= model.acclimatizationRateModifier;
  }

  // 限制在合理范围内
  return Math.max(0.6, Math.min(1.2, efficiency));
}

/**
 * 计算到达目标海拔需要的适应天数
 * 
 * @param currentAltitudeM 当前已适应海拔（米）
 * @param targetAltitudeM 目标海拔（米）
 * @param efficiency 适应效率（0.6-1.2）
 * @returns 需要的适应天数
 */
export function calculateRequiredAcclimatizationDays(
  currentAltitudeM: number,
  targetAltitudeM: number,
  efficiency: number = 1.0
): number {
  if (targetAltitudeM <= currentAltitudeM) {
    return 0;
  }

  const rules = getAcclimatizationRules();
  let totalDays = 0;
  let altitude = Math.max(currentAltitudeM, 2500); // 2500m以下不需要适应

  if (targetAltitudeM <= 2500) {
    return 0;
  }

  while (altitude < targetAltitudeM) {
    // 找到当前海拔适用的规则
    const rule = rules
      .filter(r => altitude >= r.altitudeThresholdM)
      .sort((a, b) => b.altitudeThresholdM - a.altitudeThresholdM)[0]
      || rules[0];

    // 计算到下一个阈值或目标海拔的距离
    const nextThreshold = rules.find(r => r.altitudeThresholdM > altitude)?.altitudeThresholdM;
    const segmentEnd = Math.min(
      targetAltitudeM,
      nextThreshold || Infinity
    );
    const segmentGain = segmentEnd - altitude;

    // 计算这段需要的适应天数
    const baseDays = segmentGain / rule.metersPerAcclimatizationDay;
    totalDays += baseDays / efficiency; // 效率越高，需要天数越少

    altitude = segmentEnd;
  }

  return Math.ceil(totalDays);
}

/**
 * 更新适应状态（每天调用）
 * 
 * @param currentState 当前适应状态
 * @param todaySleepingAltitudeM 今天睡眠海拔（米）
 * @param efficiency 适应效率
 * @returns 更新后的适应状态
 */
export function updateAcclimatizationState(
  currentState: AcclimatizationState | undefined,
  todaySleepingAltitudeM: number,
  efficiency: number = 1.0
): AcclimatizationState {
  const state: AcclimatizationState = currentState || {
    acclimatizedAltitudeM: 0,
    daysAtCurrentAltitude: 0,
    totalAcclimatizationDays: 0,
    acclimatizationEfficiency: efficiency,
  };

  // 如果下降到低海拔（<2500m），适应效果会逐渐丧失
  if (todaySleepingAltitudeM < 2500) {
    // 每天在低海拔，适应海拔降低约200m
    const newAcclimatizedAltitude = Math.max(0, state.acclimatizedAltitudeM - 200);
    return {
      ...state,
      acclimatizedAltitudeM: newAcclimatizedAltitude,
      daysAtCurrentAltitude: 0,
      lastAltitudeChangeDate: new Date(),
    };
  }

  // 计算海拔变化
  const altitudeChange = todaySleepingAltitudeM - state.acclimatizedAltitudeM;

  if (altitudeChange <= 0) {
    // 下降或保持：不需要额外适应
    return {
      ...state,
      daysAtCurrentAltitude: state.daysAtCurrentAltitude + 1,
      totalAcclimatizationDays: state.totalAcclimatizationDays + 1,
      lastAltitudeChangeDate: new Date(),
    };
  }

  // 上升：计算适应进度
  const rules = getAcclimatizationRules();
  const applicableRule = rules
    .filter(r => todaySleepingAltitudeM >= r.altitudeThresholdM)
    .sort((a, b) => b.altitudeThresholdM - a.altitudeThresholdM)[0]
    || rules[0];

  // 每天可以适应的海拔增益（受效率影响）
  const dailyAdaptation = applicableRule.metersPerAcclimatizationDay * efficiency;

  // 更新适应海拔（不能超过今天的睡眠海拔）
  const newAcclimatizedAltitude = Math.min(
    todaySleepingAltitudeM,
    state.acclimatizedAltitudeM + dailyAdaptation
  );

  // 检查是否超过安全上升速度（可能导致高反）
  const hasRisk = altitudeChange > applicableRule.maxDailySleepingAltitudeGainM;

  return {
    acclimatizedAltitudeM: Math.round(newAcclimatizedAltitude),
    daysAtCurrentAltitude: 1,
    totalAcclimatizationDays: state.totalAcclimatizationDays + 1,
    acclimatizationEfficiency: efficiency,
    hasAMSSymptoms: hasRisk ? true : state.hasAMSSymptoms,
    lastAltitudeChangeDate: new Date(),
  };
}

/**
 * 检查海拔变化是否安全
 * 
 * @param currentAcclimatizedAltitudeM 当前已适应海拔
 * @param targetSleepingAltitudeM 目标睡眠海拔
 * @param model 人体能力模型
 * @returns 安全检查结果
 */
export function checkAltitudeChangeSafety(
  currentAcclimatizedAltitudeM: number,
  targetSleepingAltitudeM: number,
  model: HumanCapabilityModel
): {
  isSafe: boolean;
  riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  warnings: string[];
  recommendations: string[];
} {
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let riskLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'NONE';

  // 获取适用规则
  const rules = getAcclimatizationRules();
  const applicableRule = rules
    .filter(r => targetSleepingAltitudeM >= r.altitudeThresholdM)
    .sort((a, b) => b.altitudeThresholdM - a.altitudeThresholdM)[0];

  if (!applicableRule) {
    return { isSafe: true, riskLevel: 'NONE', warnings, recommendations };
  }

  const altitudeGain = targetSleepingAltitudeM - currentAcclimatizedAltitudeM;

  // 检查1：单日海拔增益
  if (altitudeGain > applicableRule.maxDailySleepingAltitudeGainM) {
    const excess = altitudeGain - applicableRule.maxDailySleepingAltitudeGainM;
    if (excess > 500) {
      riskLevel = 'CRITICAL';
      warnings.push(`海拔增益过大（${altitudeGain}m），严重高反风险`);
      recommendations.push('建议分多天上升，或增加适应日');
    } else if (excess > 300) {
      riskLevel = 'HIGH';
      warnings.push(`海拔增益较大（${altitudeGain}m），高反风险较高`);
      recommendations.push('建议增加1天适应');
    } else {
      riskLevel = riskLevel === 'NONE' ? 'MEDIUM' : riskLevel;
      warnings.push(`海拔增益略高（${altitudeGain}m）`);
      recommendations.push('注意观察高反症状');
    }
  }

  // 检查2：绝对海拔限制
  if (model.maxElevationM && targetSleepingAltitudeM > model.maxElevationM) {
    riskLevel = 'CRITICAL';
    warnings.push(`超过用户最大安全海拔（${model.maxElevationM}m）`);
    recommendations.push('不建议前往该海拔');
  }

  // 检查3：高海拔经验匹配
  if (model.highAltitudeExperience === 'NONE' && targetSleepingAltitudeM > 3500) {
    // 如果当前风险等级低于 MEDIUM，则升级到 MEDIUM
    if (['NONE', 'LOW'].includes(riskLevel)) {
      riskLevel = 'MEDIUM';
    }
    warnings.push('无高海拔经验，超过3500m存在风险');
    recommendations.push('建议进行高海拔适应训练');
  }

  // 检查4：高反敏感度
  if (model.amsSensitivity === 'HIGH' && altitudeGain > 200) {
    // 如果当前风险等级是 NONE，则升级到 MEDIUM
    if (riskLevel === 'NONE') {
      riskLevel = 'MEDIUM';
    }
    warnings.push('高反敏感体质，需要更慢的上升速度');
    recommendations.push('建议每天海拔增益不超过200m');
  }

  const isSafe = ['NONE', 'LOW'].includes(riskLevel);

  return { isSafe, riskLevel, warnings, recommendations };
}

