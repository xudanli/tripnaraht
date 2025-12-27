// src/trips/decision/interfaces/trip-feedback.interface.ts
/**
 * Trip Feedback Interface（旅程反馈接口）
 * 
 * 用于收集用户旅程完成后的反馈，并映射到 HumanCapabilityModel
 */

/**
 * 旅程反馈
 */
export interface TripFeedback {
  /** Trip ID */
  tripId: string;
  /** 用户 ID */
  userId: string;
  /** 反馈时间 */
  feedbackAt: Date;

  /** 最累的一天（Day X） */
  mostTiredDay?: number;
  /** 最闲的一天（Day Y） */
  mostRelaxedDay?: number;
  /** 整体强度评价 */
  overallIntensity: 'TOO_LIGHT' | 'JUST_RIGHT' | 'TOO_TIRED';
  /** 高海拔不适程度 */
  altitudeDiscomfort?: 'NONE' | 'MILD' | 'SEVERE';

  /** 额外反馈（可选） */
  additionalFeedback?: {
    /** 哪些天需要调整 */
    daysNeedingAdjustment?: number[];
    /** 具体问题描述 */
    issues?: string[];
    /** 建议 */
    suggestions?: string[];
  };
}

/**
 * HumanCapabilityModel 微调建议
 */
export interface HumanCapabilityAdjustment {
  /** 用户画像 ID */
  profileId: string;
  /** 调整类型 */
  adjustmentType: 'REDUCE_ASCENT' | 'INCREASE_ASCENT' | 'REDUCE_PACE' | 'INCREASE_PACE' | 'ADJUST_ALTITUDE';
  /** 调整幅度（百分比，负数表示降低，正数表示提高） */
  adjustmentPercentage: number;
  /** 调整原因 */
  reason: string;
  /** 置信度（0-1） */
  confidence: number;
}

/**
 * 反馈分析结果
 */
export interface FeedbackAnalysisResult {
  /** 是否需要调整 */
  needsAdjustment: boolean;
  /** 调整建议列表 */
  adjustments: HumanCapabilityAdjustment[];
  /** 分析摘要 */
  summary: string;
}

