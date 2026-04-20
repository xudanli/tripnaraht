import { Injectable } from '@nestjs/common';
import { DEFAULT_TERRAIN_POLICY } from '../../trips/readiness/config/terrain-policy.config';
import type { FeasibilityFinding, RouteFeasibilityEngineInput } from './route-feasibility.types';

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
      findings.push({
        source: 'EXTREME_RULES',
        severity: 'WARNING',
        code: 'MAX_DAILY_ASCENT_EXCEEDED',
        message: `日爬升估计 ${Math.round(inferredDailyAscent)}m 超过阈值 ${maxDailyAscentM}m，需调整节奏/拆分/加休息日`,
        data: { inferredDailyAscent, maxDailyAscentM },
      });
    }

    // Rule B: winter + high wind (BLOCK)
    const month = input.environment?.month;
    const wind = input.environment?.weather?.wind_speed_mps;
    const isWinter = month !== undefined ? [11, 12, 1, 2, 3].includes(month) : undefined;
    if (isWinter === true && typeof wind === 'number' && wind > 20) {
      decision.push('BLOCK');
      findings.push({
        source: 'EXTREME_RULES',
        severity: 'BLOCK',
        code: 'WINTER_HIGH_WIND_BLOCK',
        message: `冬季风速 ${wind}m/s > 20m/s：按红线规则阻断户外高暴露活动/路线`,
        data: { month, wind_speed_mps: wind },
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

