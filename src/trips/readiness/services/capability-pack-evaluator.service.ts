// src/trips/readiness/services/capability-pack-evaluator.service.ts

/**
 * Capability Pack Evaluator Service - 能力包评估服务
 * 
 * 评估哪些能力包应该被触发，并生成相应的 Readiness 规则
 */

import { Injectable, Logger } from '@nestjs/common';
import { TripContext } from '../types/trip-context.types';
import {
  CapabilityPackConfig,
  CapabilityPackType,
  CapabilityCondition,
  CapabilityPackResult,
} from '../types/capability-pack.types';
import { RuleEngine } from '../engine/rule-engine';
import { ReadinessPack, Rule, Condition } from '../types/readiness-pack.types';

@Injectable()
export class CapabilityPackEvaluatorService {
  private readonly logger = new Logger(CapabilityPackEvaluatorService.name);
  private readonly ruleEngine = new RuleEngine();

  /**
   * 评估能力包是否应该被触发
   */
  evaluatePack(
    pack: CapabilityPackConfig,
    context: TripContext
  ): CapabilityPackResult {
    const triggered = this.evaluateTrigger(pack.trigger, context);

    if (!triggered) {
      return {
        packType: pack.type,
        triggered: false,
        rules: [],
        hazards: [],
      };
    }

    // 评估规则
    const rules = pack.rules
      .filter(rule => {
        // 检查规则是否适用
        if (rule.appliesTo) {
          if (rule.appliesTo.seasons && context.itinerary.season) {
            if (!rule.appliesTo.seasons.includes(context.itinerary.season)) {
              return false;
            }
          }
          if (rule.appliesTo.activities && context.itinerary.activities) {
            const hasMatchingActivity = rule.appliesTo.activities.some(a =>
              context.itinerary.activities?.includes(a)
            );
            if (!hasMatchingActivity) {
              return false;
            }
          }
        }

        // 评估规则条件（需要将 CapabilityCondition 转换为 Condition）
        const condition = this.convertCapabilityConditionToCondition(rule.when);
        return this.ruleEngine.evaluate(condition, context);
      })
      .map(rule => ({
        id: rule.id,
        triggered: true,
        level: rule.then.level,
        message: rule.then.message,
      }));

    // 收集风险
    const hazards = (pack.hazards || []).map(h => ({
      type: h.type,
      severity: h.severity,
      summary: h.summary,
    }));

    return {
      packType: pack.type,
      triggered: true,
      rules,
      hazards,
    };
  }

  /**
   * 将能力包转换为 Readiness Pack
   */
  convertToReadinessPack(
    pack: CapabilityPackConfig,
    destinationId: string,
    geo?: TripContext['geo']
  ): ReadinessPack {
    const rules: Rule[] = pack.rules.map(rule => ({
      id: rule.id,
      category: rule.category,
      severity: rule.severity,
      appliesTo: rule.appliesTo
        ? {
            seasons: rule.appliesTo.seasons as any,
            activities: rule.appliesTo.activities,
            travelerTags: rule.appliesTo.travelerTags,
          }
        : undefined,
      when: this.convertCapabilityConditionToCondition(rule.when),
      then: rule.then,
      evidence: rule.evidence,
      notes: rule.notes,
    }));

    const hazards = pack.hazards?.map(h => ({
      type: h.type as any,
      severity: h.severity,
      summary: h.summary,
      mitigations: h.mitigations,
    }));

    return {
      packId: `capability.${pack.type}`,
      destinationId,
      displayName: pack.displayName,
      version: '1.0.0',
      lastReviewedAt: new Date().toISOString(),
      geo: {
        countryCode: destinationId.split('-')[0] || 'XX',
        region: 'Multiple',
        city: 'Multiple',
      },
      supportedSeasons: ['all' as any],
      rules,
      checklists: [],
      hazards,
    };
  }

  /**
   * 评估触发条件
   */
  private evaluateTrigger(
    trigger: CapabilityPackConfig['trigger'],
    context: TripContext
  ): boolean {
    if (trigger.all) {
      return trigger.all.every(condition =>
        this.evaluateCondition(condition, context)
      );
    }

    if (trigger.any) {
      return trigger.any.some(condition =>
        this.evaluateCondition(condition, context)
      );
    }

    if (trigger.not) {
      return !this.evaluateCondition(trigger.not, context);
    }

    return false;
  }

  /**
   * 评估单个条件
   */
  private evaluateCondition(
    condition: CapabilityCondition,
    context: TripContext
  ): boolean {
    // 处理嵌套条件
    if (condition.all) {
      return condition.all.every(c => this.evaluateCondition(c, context));
    }

    if (condition.any) {
      return condition.any.some(c => this.evaluateCondition(c, context));
    }

    if (condition.not) {
      return !this.evaluateCondition(condition.not, context);
    }

    // 处理地理特征条件
    if (condition.geoPath) {
      const value = this.getPathValue(context, condition.geoPath);
      return this.compareValue(value, condition.operator, condition.value);
    }

    // 处理上下文条件
    if (condition.contextPath) {
      const value = this.getPathValue(context, condition.contextPath);
      return this.compareValue(value, condition.operator, condition.value);
    }

    return false;
  }

  /**
   * 从上下文中获取路径值
   */
  private getPathValue(context: any, path: string): any {
    const parts = path.split('.');
    let value = context;

    for (const part of parts) {
      if (value === null || value === undefined) {
        return undefined;
      }
      value = value[part];
    }

    return value;
  }

  /**
   * 比较值
   */
  private compareValue(
    actual: any,
    operator?: string,
    expected?: any
  ): boolean {
    if (operator === 'exists') {
      return actual !== undefined && actual !== null;
    }

    if (operator === 'eq') {
      return actual === expected;
    }

    if (operator === 'gt') {
      return typeof actual === 'number' && actual > expected;
    }

    if (operator === 'gte') {
      return typeof actual === 'number' && actual >= expected;
    }

    if (operator === 'lt') {
      return typeof actual === 'number' && actual < expected;
    }

    if (operator === 'lte') {
      return typeof actual === 'number' && actual <= expected;
    }

    if (operator === 'in') {
      return Array.isArray(expected) && expected.includes(actual);
    }

    if (operator === 'containsAny') {
      if (!Array.isArray(actual)) {
        return false;
      }
      return Array.isArray(expected) && expected.some(v => actual.includes(v));
    }

    return false;
  }

  /**
   * 将 CapabilityCondition 转换为 Condition
   */
  private convertCapabilityConditionToCondition(
    condition: CapabilityCondition
  ): Condition {
    // 处理嵌套条件
    if (condition.all) {
      return {
        all: condition.all.map(c => this.convertCapabilityConditionToCondition(c)),
      };
    }

    if (condition.any) {
      return {
        any: condition.any.map(c => this.convertCapabilityConditionToCondition(c)),
      };
    }

    if (condition.not) {
      return {
        not: this.convertCapabilityConditionToCondition(condition.not),
      };
    }

    // 处理地理路径或上下文路径条件
    const path = condition.geoPath || condition.contextPath;
    if (path && condition.operator && condition.value !== undefined) {
      const operator = condition.operator;
      const value = condition.value;

      switch (operator) {
        case 'eq':
          return { eq: { path, value } };
        case 'ne':
          return { ne: { path, value } };
        case 'gt':
          return { gt: { path, value: value as number } };
        case 'gte':
          return { gte: { path, value: value as number } };
        case 'lt':
          return { lt: { path, value: value as number } };
        case 'lte':
          return { lte: { path, value: value as number } };
        case 'in':
          return { in: { path, values: Array.isArray(value) ? value : [value] } };
        case 'exists':
          return { exists: path };
        default:
          // 默认使用 eq
          return { eq: { path, value } };
      }
    }

    // 如果没有匹配的条件，返回一个总是为 false 的条件
    return { eq: { path: '__never__', value: '__never__' } };
  }
}

