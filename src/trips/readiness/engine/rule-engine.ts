// src/trips/readiness/engine/rule-engine.ts

/**
 * Rule Engine - 规则判定引擎
 * 
 * 支持条件判定：all/any/not/eq/in/containsAny/exists
 * 用于评估 Readiness Pack 中的规则是否触发
 */

import { Condition } from '../types/readiness-pack.types';
import { TripContext } from '../types/trip-context.types';

export class RuleEngine {
  /**
   * 评估条件是否满足
   */
  evaluate(condition: Condition, context: TripContext): boolean {
    if (condition.all) {
      return condition.all.every(c => this.evaluate(c, context));
    }

    if (condition.any) {
      return condition.any.some(c => this.evaluate(c, context));
    }

    if (condition.not) {
      return !this.evaluate(condition.not, context);
    }

    if (condition.exists !== undefined) {
      return this.getPathValue(context, condition.exists) !== undefined;
    }

    if (condition.eq) {
      const actual = this.getPathValue(context, condition.eq.path);
      return actual === condition.eq.value;
    }

    if (condition.ne) {
      const actual = this.getPathValue(context, condition.ne.path);
      return actual !== condition.ne.value;
    }

    if (condition.gt) {
      const actual = this.getPathValue(context, condition.gt.path);
      return typeof actual === 'number' && actual > condition.gt.value;
    }

    if (condition.gte) {
      const actual = this.getPathValue(context, condition.gte.path);
      return typeof actual === 'number' && actual >= condition.gte.value;
    }

    if (condition.lt) {
      const actual = this.getPathValue(context, condition.lt.path);
      return typeof actual === 'number' && actual < condition.lt.value;
    }

    if (condition.lte) {
      const actual = this.getPathValue(context, condition.lte.path);
      return typeof actual === 'number' && actual <= condition.lte.value;
    }

    if (condition.in) {
      const actual = this.getPathValue(context, condition.in.path);
      return condition.in.values.includes(actual);
    }

    if (condition.containsAny) {
      const actual = this.getPathValue(context, condition.containsAny.path);
      if (!Array.isArray(actual)) {
        return false;
      }
      return condition.containsAny.values.some(v => actual.includes(v));
    }

    // 如果没有匹配的条件类型，返回 false
    return false;
  }

  /**
   * 从上下文中获取路径值
   * 支持点号分隔的嵌套路径，如 "traveler.nationality", "itinerary.activities"
   */
  private getPathValue(context: TripContext, path: string): any {
    const parts = path.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * 检查规则是否适用于当前上下文
   * 考虑 appliesTo 中的 seasons, activities, travelerTags
   */
  isRuleApplicable(
    rule: { appliesTo?: { seasons?: string[]; activities?: string[]; travelerTags?: string[] } },
    context: TripContext
  ): boolean {
    if (!rule.appliesTo) {
      return true; // 没有限制，适用于所有情况
    }

    // 检查季节
    if (rule.appliesTo.seasons && rule.appliesTo.seasons.length > 0) {
      if (!context.itinerary.season) {
        return false; // 需要季节信息但没有提供
      }
      if (!rule.appliesTo.seasons.includes(context.itinerary.season) && 
          !rule.appliesTo.seasons.includes('all')) {
        return false;
      }
    }

    // 检查活动
    if (rule.appliesTo.activities && rule.appliesTo.activities.length > 0) {
      const itineraryActivities = context.itinerary.activities || [];
      const hasMatchingActivity = rule.appliesTo.activities.some(activity =>
        itineraryActivities.includes(activity)
      );
      if (!hasMatchingActivity) {
        return false;
      }
    }

    // 检查旅行者标签
    if (rule.appliesTo.travelerTags && rule.appliesTo.travelerTags.length > 0) {
      const travelerTags = context.traveler.tags || [];
      const hasMatchingTag = rule.appliesTo.travelerTags.some(tag =>
        travelerTags.includes(tag)
      );
      if (!hasMatchingTag) {
        return false;
      }
    }

    return true;
  }
}

