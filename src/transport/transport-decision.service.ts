// src/transport/transport-decision.service.ts
import { Injectable } from '@nestjs/common';
import {
  TransportOption,
  TransportMode,
  UserContext,
  TransportRecommendation,
} from './interfaces/transport.interface';

/**
 * 交通决策服务
 * 
 * 核心功能：根据用户画像和环境因素，对交通选项进行智能排序
 * 
 * 算法：加权代价函数
 * TotalCost = 金钱成本 + (时间成本 × 时间价值) + 体力惩罚 + 场景惩罚
 */
@Injectable()
export class TransportDecisionService {
  /**
   * 核心入口：对交通选项进行排序和评分
   * 
   * @param options 原始交通选项列表（可能来自 Google Routes API）
   * @param context 用户上下文
   * @returns 排序后的推荐列表
   */
  rankOptions(
    options: TransportOption[],
    context: UserContext
  ): TransportRecommendation {
    // 计算每个选项的痛苦指数
    const scoredOptions = options.map((opt) => {
      const score = this.calculatePainScore(opt, context);
      const reason = this.generateRecommendationReason(opt, context);
      const warnings = this.generateWarnings(opt, context);
      
      return {
        ...opt,
        score,
        recommendationReason: reason,
        warnings,
      };
    });

    // 按分数从小到大排序（分数越低越好）
    const sortedOptions = scoredOptions.sort((a, b) => {
      const scoreA = a.score || 999999;
      const scoreB = b.score || 999999;
      return scoreA - scoreB;
    });

    // 生成推荐理由
    const recommendationReason = this.generateOverallReason(
      sortedOptions[0],
      context
    );

    // 生成特殊建议
    const specialAdvice = this.generateSpecialAdvice(context);

    return {
      options: sortedOptions,
      recommendationReason,
      specialAdvice,
    };
  }

  /**
   * 计算痛苦指数
   * 
   * 公式：TotalCost = 金钱成本 + (时间成本 × 时间价值) + 体力惩罚 + 场景惩罚
   */
  private calculatePainScore(
    option: TransportOption,
    context: UserContext
  ): number {
    let score = 0;

    // 1. 基础分：金钱成本 + 时间成本
    // 时间价值：1分钟 = 2元（可配置）
    const timeValue = this.getTimeValue(context);
    score += option.cost;
    score += option.durationMinutes * timeValue;

    // 2. 行李场景惩罚（换酒店日时惩罚更严重）
    if (context.hasLuggage) {
      const luggagePenalty = context.isMovingDay ? 1000 : 500; // 换酒店日时惩罚加倍
      
      if (option.mode === TransportMode.TRANSIT) {
        score += luggagePenalty; // 带着箱子坐地铁，痛苦
      }
      if (option.mode === TransportMode.WALKING && option.walkDistance > 500) {
        score += 1000; // 拖着箱子走500米以上，非常痛苦
      }
      if (option.mode === TransportMode.TAXI) {
        score -= context.isMovingDay ? 200 : 100; // 换酒店日时更鼓励打车
      }
    }

    // 3. 老人场景惩罚
    if (context.hasElderly) {
      if (option.mode === TransportMode.TRANSIT) {
        score += (option.transfers || 0) * 100; // 换乘惩罚
        score += option.walkDistance / 10; // 步行敏感度增加
      }
      if (option.mode === TransportMode.WALKING && option.durationMinutes > 15) {
        score += 999; // 老人走15分钟以上，不推荐
      }
      if (option.mode === TransportMode.TAXI) {
        score -= 50; // 鼓励打车
      }
    }

    // 4. 天气惩罚
    if (context.isRaining) {
      if (option.mode === TransportMode.WALKING) {
        score += 9999; // 下雨绝对不走
      }
      if (option.mode === TransportMode.TRANSIT) {
        score += option.walkDistance / 5; // 步行去地铁站也痛苦
      }
      if (option.mode === TransportMode.TAXI) {
        score -= 200; // 下雨时打车更推荐
      }
    }

    // 5. 行动不便惩罚
    if (context.hasLimitedMobility) {
      if (option.mode === TransportMode.WALKING) {
        score += 5000; // 行动不便不能步行
      }
      if (option.mode === TransportMode.TRANSIT) {
        score += 1000; // 公共交通也不方便
      }
      if (option.mode === TransportMode.TAXI) {
        score -= 300; // 强烈推荐打车
      }
    }

    // 6. 预算敏感度调整
    if (context.budgetSensitivity === 'HIGH') {
      // 预算敏感时，增加高费用选项的惩罚
      if (option.cost > 100) {
        score += (option.cost - 100) * 0.5;
      }
    }

    // 7. 换乘惩罚（公共交通）
    if (option.mode === TransportMode.TRANSIT) {
      if ((option.transfers || 0) > 2) {
        score += 500; // 换乘超过2次，痛苦
      }
    }

    return Math.round(score);
  }

  /**
   * 获取时间价值（元/分钟）
   */
  private getTimeValue(context: UserContext): number {
    // 基础值：1分钟 = 2元
    let baseValue = 2;

    // 时间敏感度调整
    if (context.timeSensitivity === 'HIGH') {
      baseValue = 5; // 时间敏感时，时间价值更高
    } else if (context.timeSensitivity === 'LOW') {
      baseValue = 1; // 时间不敏感时，时间价值较低
    }

    return baseValue;
  }

  /**
   * 生成推荐理由
   */
  private generateRecommendationReason(
    option: TransportOption,
    context: UserContext
  ): string {
    const reasons: string[] = [];

    if (option.mode === TransportMode.TAXI) {
      if (context.hasLuggage) {
        reasons.push('适合携带行李');
      }
      if (context.hasElderly) {
        reasons.push('适合老人出行');
      }
      if (context.isRaining) {
        reasons.push('避免淋雨');
      }
      if (context.hasLimitedMobility) {
        reasons.push('无障碍出行');
      }
    }

    if (option.mode === TransportMode.TRANSIT) {
      if (option.cost < 50) {
        reasons.push('经济实惠');
      }
      if ((option.transfers || 0) === 0) {
        reasons.push('无需换乘');
      }
    }

    if (option.mode === TransportMode.WALKING) {
      if (option.durationMinutes < 15) {
        reasons.push('距离较近');
      }
      reasons.push('免费');
    }

    return reasons.length > 0 ? reasons.join('、') : '推荐此方式';
  }

  /**
   * 生成警告信息
   */
  private generateWarnings(
    option: TransportOption,
    context: UserContext
  ): string[] {
    const warnings: string[] = [];

    if (option.mode === TransportMode.WALKING) {
      if (option.walkDistance > 1000) {
        warnings.push(`需要步行 ${Math.round(option.walkDistance / 1000 * 10) / 10} 公里`);
      }
      if (context.isRaining) {
        warnings.push('当前正在下雨，不建议步行');
      }
      if (context.hasLuggage) {
        warnings.push('携带行李时步行不便');
      }
    }

    if (option.mode === TransportMode.TRANSIT) {
      if ((option.transfers || 0) > 1) {
        warnings.push(`需要换乘 ${option.transfers} 次`);
      }
      if (option.walkDistance > 800) {
        warnings.push(`需要步行 ${Math.round(option.walkDistance)} 米到车站`);
      }
      if (context.hasLuggage) {
        warnings.push('携带大件行李时乘坐公共交通不便');
      }
      if (context.hasElderly && (option.transfers || 0) > 0) {
        warnings.push('换乘对老人不友好');
      }
    }

    if (option.mode === TransportMode.TAXI) {
      if (option.cost > 200) {
        warnings.push(`费用较高（${option.cost} 元）`);
      }
    }

    return warnings;
  }

  /**
   * 生成整体推荐理由
   */
  private generateOverallReason(
    topOption: TransportOption,
    context: UserContext
  ): string {
    if (topOption.mode === TransportMode.TAXI) {
      if (context.hasLuggage && context.isRaining) {
        return '您带着行李，且外面正在下雨，建议打车出行';
      }
      if (context.hasElderly) {
        return '考虑到有老人同行，建议打车出行';
      }
      if (context.hasLuggage) {
        return '您带着行李，建议打车出行';
      }
    }

    if (topOption.mode === TransportMode.TRANSIT) {
      if (topOption.cost < 50) {
        return '公共交通经济实惠，推荐使用';
      }
    }

    if (topOption.mode === TransportMode.WALKING) {
      return '距离较近，建议步行';
    }

    return '推荐此交通方式';
  }

  /**
   * 生成特殊建议
   */
  private generateSpecialAdvice(context: UserContext): string[] {
    const advice: string[] = [];

    // 换酒店日建议
    if (context.isMovingDay && context.currentCity !== context.targetCity) {
      if (context.currentCity === 'JP' || context.targetCity === 'JP') {
        advice.push(
          '💡 建议使用宅急便（Yamato）将行李直接寄到下一家酒店，今日轻装游玩'
        );
      } else {
        advice.push(
          '💡 建议先去酒店存行李，再开始游玩'
        );
      }
    }

    // 大件行李建议
    if (context.hasLuggage && !context.isMovingDay) {
      advice.push('💡 如果可能，建议将行李寄存在酒店或车站的行李寄存处');
    }

    return advice;
  }
}

