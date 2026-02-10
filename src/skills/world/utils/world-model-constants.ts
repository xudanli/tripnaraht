/**
 * 世界模型常量定义
 * 
 * Code Review P1修复：提取魔法数字为常量
 */

/**
 * 置信度阈值
 */
export class ConfidenceThresholds {
  /** 高置信度阈值 */
  static readonly HIGH = 0.8;
  
  /** 中等置信度阈值 */
  static readonly MEDIUM = 0.7;
  
  /** 低置信度阈值 */
  static readonly LOW = 0.5;
  
  /** 用户报告置信度（较低） */
  static readonly USER_REPORT = 0.7;
  
  /** API调用置信度 */
  static readonly API_CALL = 0.8;
  
  /** 专家验证置信度 */
  static readonly EXPERT_VERIFICATION = 0.9;
  
  /** 预测置信度范围 */
  static readonly PREDICTION = {
    LOWER: 0.7,
    UPPER: 0.9,
  };
}

/**
 * 质量评分阈值
 */
export class QualityScoreThresholds {
  /** 高质量阈值 */
  static readonly HIGH = 0.8;
  
  /** 中等质量阈值 */
  static readonly MEDIUM = 0.7;
  
  /** 低质量阈值 */
  static readonly LOW = 0.5;
  
  /** 需要审核的阈值 */
  static readonly NEEDS_REVIEW = 0.7;
  
  /** 自动批准阈值 */
  static readonly AUTO_APPROVE = 0.8;
}

/**
 * 风险阈值
 */
export class RiskThresholds {
  /** 高风险阈值 */
  static readonly HIGH = 0.7;
  
  /** 中等风险阈值 */
  static readonly MEDIUM = 0.4;
  
  /** 低风险阈值 */
  static readonly LOW = 0.2;
}

/**
 * 相似度阈值
 */
export class SimilarityThresholds {
  /** 非常相似（几乎相同） */
  static readonly VERY_SIMILAR = 0.95;
  
  /** 相似 */
  static readonly SIMILAR = 0.8;
  
  /** 中等相似 */
  static readonly MODERATE = 0.6;
}

/**
 * 预测准确度阈值
 */
export class PredictionAccuracyThresholds {
  /** 高准确度 */
  static readonly HIGH = 0.8;
  
  /** 中等准确度 */
  static readonly MEDIUM = 0.7;
  
  /** 低准确度 */
  static readonly LOW = 0.5;
}

/**
 * 权重配置
 */
export class WeightConfigs {
  /** 质量评分权重（用于综合评分） */
  static readonly QUALITY_SCORE = 0.7;
  
  /** 置信度权重（用于综合评分） */
  static readonly CONFIDENCE = 0.3;
  
  /** 平均质量评分权重（用于可靠性计算） */
  static readonly AVERAGE_QUALITY = 0.7;
  
  /** 批准率权重（用于可靠性计算） */
  static readonly APPROVAL_RATE = 0.3;
  
  /** 用户节奏调整（快速） */
  static readonly USER_PACE_FAST = 0.8;
  
  /** 用户节奏调整（正常） */
  static readonly USER_PACE_NORMAL = 1.0;
  
  /** 用户节奏调整（慢速） */
  static readonly USER_PACE_SLOW = 1.2;
}

/**
 * 默认值
 */
export class DefaultValues {
  /** 默认置信度 */
  static readonly CONFIDENCE = 0.8;
  
  /** 默认质量评分 */
  static readonly QUALITY_SCORE = 0.7;
  
  /** 默认预测准确度 */
  static readonly PREDICTION_ACCURACY = 0.8;
  
  /** 默认可达性评分 */
  static readonly ACCESSIBILITY_SCORE = 0.9;
  
  /** 默认相似度 */
  static readonly SIMILARITY = 0.7;
  
  /** 默认可靠性 */
  static readonly RELIABILITY = 0.7;
  
  /** 默认一致性 */
  static readonly CONSISTENCY = 0.7;
  
  /** 用户能力匹配容差（80%） */
  static readonly USER_CAPABILITY_TOLERANCE = 0.8;
}
