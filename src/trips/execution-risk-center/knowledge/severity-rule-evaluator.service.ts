import { Injectable } from '@nestjs/common';
import {
  ExecutionRiskSeverity,
  SeverityRule,
  SeverityRuleOperator,
} from '../../../generated/execution-risk-contracts';
import type { ExecutionGate, RiskLevel } from '../types/execution-risk.types';
import type { RiskMetricBag } from './risk-metric-extraction.util';
import type { MappedSeverityRule } from './execution-risk-knowledge.mappers';
import { ExecutionRiskKnowledgeRepositoryService } from './execution-risk-knowledge.repository';

export interface SeverityEvaluationContext {
  metrics: RiskMetricBag;
  fields?: Record<string, string | number | boolean | string[]>;
}

export interface SeverityEvaluationResult {
  matchedRuleId: string;
  severity: ExecutionRiskSeverity;
  level: RiskLevel;
  executionGate: ExecutionGate;
  metricValue?: number | string;
  metricUnit?: string;
}

@Injectable()
export class SeverityRuleEvaluatorService {
  constructor(private readonly knowledge: ExecutionRiskKnowledgeRepositoryService) {}

  async evaluate(
    knowledgeCode: string,
    context: SeverityEvaluationContext,
  ): Promise<SeverityEvaluationResult | null> {
    const rules = await this.knowledge.findSeverityRules(knowledgeCode);
    if (rules.length === 0) return null;

    for (const rule of rules) {
      if (this.ruleMatches(rule as MappedSeverityRule, context)) {
        const rawMetric = context.metrics[(rule as MappedSeverityRule).metric as string];
        const metricValue =
          typeof rawMetric === 'boolean' ? undefined : rawMetric;
        return {
          matchedRuleId: rule.ruleId,
          severity: rule.level,
          level: severityToRiskLevel(rule.level),
          executionGate: severityToExecutionGate(rule.level),
          metricValue,
          metricUnit: rule.unit,
        };
      }
    }
    return null;
  }

  private ruleMatches(rule: MappedSeverityRule, context: SeverityEvaluationContext): boolean {
    const metricKey = String(rule.metric);
    const value = context.metrics[metricKey];
    if (value === undefined) return false;

    if (rule.matchValue != null) {
      return rule.operator === SeverityRuleOperator.EQ && String(value) === String(rule.matchValue);
    }

    if (typeof value !== 'number') return false;
    if (!compareNumericMetric(value, rule.operator, rule.minValue, rule.maxValue)) return false;
    return this.conditionsMatch(rule, context.fields ?? {});
  }

  private conditionsMatch(
    rule: SeverityRule,
    fields: Record<string, string | number | boolean | string[]>,
  ): boolean {
    for (const condition of rule.conditions ?? []) {
      const actual = fields[condition.field];
      const op = String(condition.operator);
      const values =
        (condition as { values?: unknown[] }).values ??
        (Array.isArray(condition.value) ? condition.value : [condition.value]);

      if (op === 'IN') {
        if (actual === undefined) return false;
        const actualList = Array.isArray(actual) ? actual : [String(actual)];
        if (!actualList.some((v) => values.map(String).includes(String(v)))) return false;
        continue;
      }
      if (op === 'EQ' && String(actual) !== String(condition.value)) return false;
      if (op === 'LT' && !(Number(actual) < Number(condition.value))) return false;
      if (op === 'LTE' && !(Number(actual) <= Number(condition.value))) return false;
      if (op === 'GT' && !(Number(actual) > Number(condition.value))) return false;
      if (op === 'GTE' && !(Number(actual) >= Number(condition.value))) return false;
    }
    return true;
  }
}

function compareNumericMetric(
  value: number,
  operator: SeverityRuleOperator,
  minValue?: number,
  maxValue?: number,
): boolean {
  switch (operator) {
    case SeverityRuleOperator.GTE:
      return minValue !== undefined && value >= minValue;
    case SeverityRuleOperator.GT:
      return minValue !== undefined && value > minValue;
    case SeverityRuleOperator.LTE:
      return minValue !== undefined && value <= minValue;
    case SeverityRuleOperator.LT:
      return minValue !== undefined && value < minValue;
    case SeverityRuleOperator.EQ:
      return minValue !== undefined && value === minValue;
    case SeverityRuleOperator.BETWEEN:
      return (
        minValue !== undefined &&
        maxValue !== undefined &&
        value >= minValue &&
        value <= maxValue
      );
    default:
      return false;
  }
}

function severityToRiskLevel(severity: ExecutionRiskSeverity): RiskLevel {
  if (severity === ExecutionRiskSeverity.STOP) return 'CRITICAL';
  if (severity === ExecutionRiskSeverity.REPLAN_REQUIRED) return 'HIGH';
  return 'MEDIUM';
}

function severityToExecutionGate(severity: ExecutionRiskSeverity): ExecutionGate {
  if (severity === ExecutionRiskSeverity.STOP) return 'STOP';
  if (severity === ExecutionRiskSeverity.REPLAN_REQUIRED) return 'REPLAN_REQUIRED';
  return 'AT_RISK';
}
