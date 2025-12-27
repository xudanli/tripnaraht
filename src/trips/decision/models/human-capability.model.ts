// src/trips/decision/models/human-capability.model.ts
/**
 * Human Capability Model（人体能力模型）
 * 
 * 第一性原理：单日可承受爬升、连续滚动爬升、最大坡度、高海拔适应度、风险承受度、节奏偏好
 * 
 * DecisionParams 是从这个模型投影出来的
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

  /** 元数据（用于扩展） */
  metadata?: Record<string, any>;
}

/**
 * 从用户画像关键词生成人体能力模型
 */
export function createHumanCapabilityModelFromProfile(
  profileId: string,
  keywords: {
    pace?: 'slow' | 'relaxed' | 'normal' | 'fast' | 'intense';
    fitness?: 'low' | 'medium' | 'high' | 'extreme';
    riskTolerance?: 'low' | 'medium' | 'high';
    highAltitudeExperience?: 'none' | 'basic' | 'advanced';
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
  };
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

