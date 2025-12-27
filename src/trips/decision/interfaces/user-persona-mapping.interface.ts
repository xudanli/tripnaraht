// src/trips/decision/interfaces/user-persona-mapping.interface.ts
/**
 * 用户画像 → 决策参数映射
 * 
 * PART 3: 你现在终于可以把"用户偏好"变成 物理世界规则。
 * 
 * 映射规则（示例）：
 * - "我节奏慢" → rollingAscent 阈值 ↓
 * - "我怕风险" → weatherRiskWeight ↑
 * - "我爱摄影" → 日出日落窗口权重 ↑
 * - "我想轻松" → maxSlopeTolerance ↓
 */

/**
 * 用户偏好输入
 */
export interface UserPreferenceInput {
  /** 节奏偏好 */
  pace?: 'relaxed' | 'moderate' | 'intense';
  /** 风险容忍度 */
  riskTolerance?: 'low' | 'medium' | 'high';
  /** 兴趣标签 */
  interests?: string[]; // 如 ['摄影', '徒步', '文化']
  /** 特殊需求 */
  specialNeeds?: string[]; // 如 ['日出日落', '轻松', '挑战']
}

/**
 * 决策参数（物理世界规则）
 */
export interface DecisionParams {
  /** 最大每日爬升（米） */
  maxDailyAscentM: number;
  /** 3天滚动累计爬升阈值（米） */
  rollingAscent3DaysThreshold: number;
  /** 天气风险权重（0-1） */
  weatherRiskWeight: number;
  /** 坡度容忍度（百分比） */
  maxSlopeTolerance: number;
  /** 缓冲日偏好（0-1，越高越倾向于插入缓冲日） */
  bufferDayBias: number;
  /** 日出日落窗口权重（0-1，摄影用户更高） */
  sunriseSunsetWindowWeight: number;
  /** 走廊质量权重（0-1，高级路线偏好） */
  corridorQualityWeight: number;
}

/**
 * 用户画像映射服务
 * 
 * 将用户"感受"映射为物理世界规则
 */
export class UserPersonaMappingService {
  /**
   * 将用户偏好映射为决策参数
   */
  static mapPreferenceToParams(
    preference: UserPreferenceInput,
    baseParams?: Partial<DecisionParams>
  ): DecisionParams {
    const base: DecisionParams = {
      maxDailyAscentM: 1000,
      rollingAscent3DaysThreshold: 2500,
      weatherRiskWeight: 0.5,
      maxSlopeTolerance: 25,
      bufferDayBias: 0.3,
      sunriseSunsetWindowWeight: 0.2,
      corridorQualityWeight: 0.5,
      ...baseParams,
    };

    // 节奏偏好映射
    if (preference.pace === 'relaxed') {
      base.maxDailyAscentM *= 0.7; // 降低 30%
      base.rollingAscent3DaysThreshold *= 0.8; // 降低 20%
      base.bufferDayBias = 0.6; // 增加缓冲日偏好
      base.maxSlopeTolerance *= 0.8; // 降低坡度容忍度
    } else if (preference.pace === 'intense') {
      base.maxDailyAscentM *= 1.2; // 增加 20%
      base.rollingAscent3DaysThreshold *= 1.1; // 增加 10%
      base.bufferDayBias = 0.1; // 降低缓冲日偏好
    }

    // 风险容忍度映射
    if (preference.riskTolerance === 'low') {
      base.weatherRiskWeight = 0.8; // 提高天气风险权重
      base.maxSlopeTolerance *= 0.7; // 降低坡度容忍度
      base.bufferDayBias = 0.7; // 增加缓冲日偏好
    } else if (preference.riskTolerance === 'high') {
      base.weatherRiskWeight = 0.3; // 降低天气风险权重
      base.maxSlopeTolerance *= 1.2; // 提高坡度容忍度
    }

    // 兴趣标签映射
    if (preference.interests?.includes('摄影')) {
      base.sunriseSunsetWindowWeight = 0.7; // 提高日出日落窗口权重
      base.corridorQualityWeight = 0.8; // 提高走廊质量权重（观景）
    }

    if (preference.interests?.includes('徒步')) {
      base.maxSlopeTolerance *= 1.1; // 徒步用户对坡度容忍度更高
    }

    // 特殊需求映射
    if (preference.specialNeeds?.includes('轻松')) {
      base.maxDailyAscentM *= 0.6; // 大幅降低爬升
      base.maxSlopeTolerance *= 0.6; // 大幅降低坡度容忍度
      base.bufferDayBias = 0.8; // 大幅增加缓冲日
    }

    if (preference.specialNeeds?.includes('挑战')) {
      base.maxDailyAscentM *= 1.3; // 增加爬升
      base.rollingAscent3DaysThreshold *= 1.2; // 增加滚动阈值
      base.bufferDayBias = 0.1; // 降低缓冲日偏好
    }

    return base;
  }

  /**
   * 获取用户偏好的文字描述
   */
  static getPreferenceDescription(preference: UserPreferenceInput): string {
    const parts: string[] = [];

    if (preference.pace) {
      parts.push(`节奏: ${preference.pace === 'relaxed' ? '慢' : preference.pace === 'intense' ? '快' : '中等'}`);
    }

    if (preference.riskTolerance) {
      parts.push(`风险容忍: ${preference.riskTolerance === 'low' ? '低' : preference.riskTolerance === 'high' ? '高' : '中'}`);
    }

    if (preference.interests && preference.interests.length > 0) {
      parts.push(`兴趣: ${preference.interests.join(', ')}`);
    }

    return parts.join(' | ');
  }
}

