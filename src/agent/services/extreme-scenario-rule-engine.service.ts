import { Injectable } from '@nestjs/common';
import { DEFAULT_TERRAIN_POLICY } from '../../trips/readiness/config/terrain-policy.config';
import type { ConstraintViolation, FeasibilityFinding, RouteFeasibilityEngineInput } from './route-feasibility.types';
import { CONSTRAINT_IDS } from './constraint-registry';

export type ExtremeRuleDecision = 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK';

export interface ExtremeRuleEvaluation {
  decision: ExtremeRuleDecision;
  findings: FeasibilityFinding[];
}

/**
 * ExtremeScenarioRuleEngineService
 *
 * Goals:
 * - expert-rule-first (not LLM generated)
 * - deterministic
 * - explainable via findings[]
 *
 * Current scope (incremental productization):
 * - max daily ascent threshold (from DEFAULT_TERRAIN_POLICY.terrainConstraints)
 * - high wind winter block (mirrors DomainExpertKnowledgeService sample semantics)
 *
 * Future:
 * - vehicle/road-type compatibility (F-road + non-4x4 block)
 * - continuous fatigue accumulation across days using DEM per-day segments
 */
@Injectable()
export class ExtremeScenarioRuleEngineService {
  evaluate(input: RouteFeasibilityEngineInput): ExtremeRuleEvaluation {
    const findings: FeasibilityFinding[] = [];

    const decision: ExtremeRuleDecision[] = [];

    // Rule A: max daily ascent threshold (ADJUST_REQUIRED)
    const maxDailyAscentM = DEFAULT_TERRAIN_POLICY.terrainConstraints.maxDailyAscentM;
    const inferredDailyAscent = this.inferDailyAscentFromResearch(input.researchData);
    if (inferredDailyAscent !== undefined && inferredDailyAscent > maxDailyAscentM) {
      decision.push('ADJUST_REQUIRED');
      const violation: ConstraintViolation = {
        anchor: {
          constraintId: CONSTRAINT_IDS.TERRAIN_MAX_DAILY_ASCENT_M,
          ruleId: 'extreme_rules.max_daily_ascent',
          policyId: 'DEFAULT_TERRAIN_POLICY',
        },
        entityRef: { type: 'DAY' },
        metric: {
          cmp: 'LEQ',
          actual: inferredDailyAscent,
          limit: maxDailyAscentM,
          unit: 'm',
          // LEQ slack: limit - actual (negative => violation)
          slack: maxDailyAscentM - inferredDailyAscent,
        },
        evidence: { source: 'DEM' },
        scope: 'GLOBAL',
        suggestedActions: [
          { action: 'RELAX', detail: 'reduce ascent / split day / add rest day' },
          { action: 'REORDER', detail: 'redistribute high-effort segments across days' },
        ],
      };
      findings.push({
        source: 'EXTREME_RULES',
        severity: 'WARNING',
        code: 'MAX_DAILY_ASCENT_EXCEEDED',
        message: `日爬升估计 ${Math.round(inferredDailyAscent)}m 超过阈值 ${maxDailyAscentM}m，需调整节奏/拆分/加休息日`,
        data: { inferredDailyAscent, maxDailyAscentM },
        violation,
      });
    }

    // Rule B: winter + high wind (BLOCK)
    const month = input.environment?.month;
    const wind = input.environment?.weather?.wind_speed_mps;
    const isWinter = month !== undefined ? [11, 12, 1, 2, 3].includes(month) : undefined;
    if (isWinter === true && typeof wind === 'number' && wind > 20) {
      decision.push('BLOCK');
      const violation: ConstraintViolation = {
        anchor: {
          // v0 constraintId: environment.wind_speed_limit (winter-high-wind is a specific lemma/ruleId)
          constraintId: CONSTRAINT_IDS.ENVIRONMENT_WIND_SPEED_LIMIT,
          ruleId: 'extreme_rules.winter_high_wind_block',
          policyId: 'DEFAULT_TERRAIN_POLICY',
        },
        entityRef: { type: 'SEGMENT' },
        metric: {
          cmp: 'LEQ',
          actual: wind,
          limit: 20,
          unit: 'm/s',
          // LEQ slack: limit - actual (negative => violation)
          slack: 20 - wind,
        },
        evidence: { source: 'WEATHER' },
        scope: 'GLOBAL',
        suggestedActions: [{ action: 'BLOCK', detail: 'avoid exposed outdoor routes; replan dates/region' }],
      };
      findings.push({
        source: 'EXTREME_RULES',
        severity: 'BLOCK',
        code: 'WINTER_HIGH_WIND_BLOCK',
        message: `冬季风速 ${wind}m/s > 20m/s：按红线规则阻断户外高暴露活动/路线`,
        data: { month, wind_speed_mps: wind },
        violation,
      });
    }

    return {
      decision: decision.includes('BLOCK') ? 'BLOCK' : decision.includes('ADJUST_REQUIRED') ? 'ADJUST_REQUIRED' : 'ALLOW',
      findings,
    };
  }

  /**
   * Best-effort inference of "daily ascent" from upstream evidence.
   *
   * Expected sources:
   * - world.physical.demEvidence[0].cumulativeAscent and duration(days) to derive average daily ascent
   * - world.physical.demEvidence[0].rollingAscent3Days (if present)
   */
  private inferDailyAscentFromResearch(researchData?: Record<string, unknown>): number | undefined {
    if (!researchData) return undefined;

    // world.buildContext shape (best-effort)
    const world = (researchData as any).world;
    const physical = world?.physical;
    const demEvidence = physical?.demEvidence;
    if (!Array.isArray(demEvidence) || demEvidence.length === 0) return undefined;

    const first = demEvidence[0];
    const cumulativeAscent = typeof first?.cumulativeAscent === 'number' ? first.cumulativeAscent : undefined;
    const rolling3 = typeof first?.rollingAscent3Days === 'number' ? first.rollingAscent3Days : undefined;

    // Prefer rolling 3-day ascent as a conservative proxy for "daily" (divide by 3)
    if (rolling3 !== undefined && rolling3 > 0) {
      return rolling3 / 3;
    }

    // Fall back to average over trip duration if provided
    const durationDays =
      typeof (researchData as any).duration_days === 'number'
        ? (researchData as any).duration_days
        : typeof (researchData as any).duration === 'number'
          ? (researchData as any).duration
          : undefined;

    if (cumulativeAscent !== undefined && durationDays && durationDays > 0) {
      return cumulativeAscent / durationDays;
    }

    return undefined;
  }
}

