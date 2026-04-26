import { Injectable, Optional } from '@nestjs/common';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ExperienceAgentService } from './domain-agents/experience-agent.service';
import { TerrainRiskService } from '../../trips/readiness/services/terrain-risk.service';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type {
  RouteFeasibilityEngineInput,
  RouteFeasibilityEngineOutput,
  FeasibilityFinding,
  FeasibilityResult,
} from './route-feasibility.types';
import type { ItineraryVerifyOutput } from '../../skills/itinerary/itinerary-verify.skill';
import { ExtremeScenarioRuleEngineService } from './extreme-scenario-rule-engine.service';
import { CONSTRAINT_IDS } from './constraint-registry';
import {
  constraintIdFromItineraryVerifyType,
  constraintIdFromTerrainRiskFlagType,
} from './constraint-mapping.v0';
import { DEFAULT_TERRAIN_POLICY } from '../../trips/readiness/config/terrain-policy.config';

@Injectable()
export class RouteFeasibilityEngineService {
  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
    @Optional() private readonly terrainRisk?: TerrainRiskService,
    @Optional() private readonly extremeRules?: ExtremeScenarioRuleEngineService,
  ) {}

  async evaluate(input: RouteFeasibilityEngineInput): Promise<RouteFeasibilityEngineOutput> {
    const findings: FeasibilityFinding[] = [];
    const issues: string[] = [];
    const itinerary: Itinerary = input.itinerary;

    // 1) itinerary.verify (logistics/time/fatigue threshold heuristics)
    const verifyOutput = await this.runItineraryVerify(itinerary, input.researchData);
    if (verifyOutput) {
      for (const i of verifyOutput.issues) {
        const severity = i.severity === 'ERROR' ? 'BLOCK' : 'WARNING';
        const violationAnchor = constraintIdFromItineraryVerifyType(i.type);
        const carried = (i as any)?.violation;
        findings.push({
          source: 'ITINERARY_VERIFY',
          severity,
          code: i.type,
          message: i.message,
          data: { suggestion: i.suggestion, day: i.day, item_id: i.item_id },
          ...(carried
            ? { violation: carried }
            : violationAnchor
              ? {
                  violation: {
                    anchor: { constraintId: violationAnchor, ruleId: `itinerary.verify:${i.type}` },
                    entityRef: i.item_id ? { type: 'POI', id: i.item_id } : i.day ? { type: 'DAY', id: i.day } : { type: 'OTHER' },
                    evidence: {
                      source:
                        i.type === 'OPENING_HOURS_CONFLICT'
                          ? 'OPENING_HOURS'
                          : i.type === 'REACHABILITY_ISSUE'
                            ? 'TRANSPORT'
                            : 'RULE',
                    },
                    scope: i.day ? 'GLOBAL' : 'LOCAL',
                  },
                }
              : {}),
        });
        issues.push(`[VERIFY] ${i.type}: ${i.message}${i.suggestion ? `（建议：${i.suggestion}）` : ''}`);
      }
    }

    // 2) ExperienceAgent: executability score (human feasibility)
    let executabilityScore: number | undefined;
    if (this.experienceAgent) {
      try {
        const profile = {
          fitness_level: input.userProfile?.fitness_level ?? 'MEDIUM',
          age_group: undefined,
          special_needs: [],
        };
        const exec = await this.experienceAgent.assessHumanExecutability(itinerary, profile);
        executabilityScore = exec.executability_score;

        if (exec.executability_score < 50) {
          findings.push({
            source: 'EXPERIENCE_EXECUTABILITY',
            severity: 'BLOCK',
            code: 'LOW_EXECUTABILITY_SCORE',
            message: `人体可执行性过低 (${exec.executability_score}/100)`,
            data: { breakdown: exec.breakdown, challenges: exec.challenge_points?.slice(0, 3) },
          });
          issues.push(`[体验评估] 人体可执行性过低 (${exec.executability_score}/100)`);
        } else if (exec.executability_score < 70) {
          findings.push({
            source: 'EXPERIENCE_EXECUTABILITY',
            severity: 'WARNING',
            code: 'MEDIUM_EXECUTABILITY_SCORE',
            message: `人体可执行性偏低 (${exec.executability_score}/100)`,
            data: { breakdown: exec.breakdown, challenges: exec.challenge_points?.slice(0, 3) },
          });
          issues.push(`[体验评估] 人体可执行性偏低 (${exec.executability_score}/100)`);
        }
      } catch (e: any) {
        findings.push({
          source: 'EXPERIENCE_EXECUTABILITY',
          severity: 'WARNING',
          code: 'EXECUTABILITY_EVAL_FAILED',
          message: `人体可执行性评估失败: ${e?.message || 'unknown error'}`,
        });
      }
    }

    // 3) ExperienceAgent: fatigue projection (fatigue_score)
    let fatigueScore = 0;
    if (this.experienceAgent) {
      try {
        const profile = {
          fitness_level: input.userProfile?.fitness_level ?? 'MEDIUM',
          age_group: undefined,
        };
        const fatigue = await this.experienceAgent.predictFatigue(itinerary, profile);
        fatigueScore = clamp01To100(fatigue.cumulative_fatigue.end_of_trip_level / 100);

        if (fatigue.overexertion_probability >= 0.6) {
          findings.push({
            source: 'EXPERIENCE_FATIGUE',
            severity: 'WARNING',
            code: 'OVEREXERTION_PROB_HIGH',
            message: `过劳概率偏高 (${Math.round(fatigue.overexertion_probability * 100)}%)`,
            data: { end_level: fatigue.cumulative_fatigue.end_of_trip_level, trend: fatigue.cumulative_fatigue.trend },
          });
          issues.push(`[疲劳预测] 过劳概率偏高 (${Math.round(fatigue.overexertion_probability * 100)}%)`);
        }
      } catch (e: any) {
        findings.push({
          source: 'EXPERIENCE_FATIGUE',
          severity: 'WARNING',
          code: 'FATIGUE_PREDICT_FAILED',
          message: `疲劳预测失败: ${e?.message || 'unknown error'}`,
        });
      }
    }

    // 4) Terrain evidence (if available via researchData.world.physical.demEvidence)
    const terrainFlags = this.evaluateTerrainFlagsFromResearch(input.researchData);
    for (const f of terrainFlags.findings) {
      findings.push(f);
      if (f.severity !== 'INFO') {
        issues.push(`[地形] ${f.message}`);
      }
    }

    // 5) Extreme scenario rules (expert deterministic)
    if (this.extremeRules) {
      const r = this.extremeRules.evaluate(input);
      for (const f of r.findings) {
        findings.push(f);
        issues.push(`[极端规则] ${f.message}`);
      }
    }

    // Aggregate
    const isBlocked =
      findings.some((f) => f.severity === 'BLOCK') ||
      (verifyOutput ? verifyOutput.verified === false : false);

    const risk_level = this.computeRiskLevel(findings, {
      executabilityScore,
      fatigueScore,
    });

    const result: FeasibilityResult = {
      is_feasible: !isBlocked,
      blocking_reason: isBlocked ? this.pickBlockingReason(findings) : undefined,
      risk_level,
      fatigue_score: fatigueScore,
    };

    return { result, findings, issues, itinerary };
  }

  private async runItineraryVerify(
    itinerary: Itinerary,
    researchData?: Record<string, unknown>,
  ): Promise<ItineraryVerifyOutput | null> {
    if (!this.skillsRegistry) return null;
    const skill = this.skillsRegistry.getSkill('itinerary.verify');
    if (!skill) return null;
    const out = (await skill.execute({
      itinerary: itinerary as any,
      research_data: researchData as any,
    })) as ItineraryVerifyOutput;
    return out ?? null;
  }

  private evaluateTerrainFlagsFromResearch(researchData?: Record<string, unknown>): { findings: FeasibilityFinding[] } {
    const findings: FeasibilityFinding[] = [];
    if (!this.terrainRisk || !researchData) return { findings };

    const world = (researchData as any).world;
    const physical = world?.physical;
    const demEvidence = physical?.demEvidence;
    if (!Array.isArray(demEvidence) || demEvidence.length === 0) return { findings };

    // Convert demEvidence -> minimal TerrainFacts-like object for TerrainRiskService
    // We intentionally evaluate using the first evidence segment for now.
    const ev = demEvidence[0];
    const maxElevationM = typeof ev?.metadata?.elevationRange?.max === 'number' ? ev.metadata.elevationRange.max : undefined;
    const minElevationM = typeof ev?.metadata?.elevationRange?.min === 'number' ? ev.metadata.elevationRange.min : undefined;

    const terrainFactsLike = {
      terrainStats: {
        minElevationM: minElevationM ?? 0,
        maxElevationM: maxElevationM ?? 0,
        totalAscentM: typeof ev?.cumulativeAscent === 'number' ? ev.cumulativeAscent : 0,
        totalDescentM: 0,
        maxSlopePct: typeof ev?.maxSlopePct === 'number' ? ev.maxSlopePct : 0,
        avgSlopePct: typeof ev?.metadata?.avgSlopePct === 'number' ? ev.metadata.avgSlopePct : 0,
        effortScore: typeof ev?.fatigueIndex === 'number' ? Math.min(100, Math.max(0, ev.fatigueIndex)) : 0,
        totalDistanceM: typeof ev?.metadata?.distanceM === 'number' ? ev.metadata.distanceM : 0,
      },
      effortLevel: 'MODERATE',
      riskFlags: [],
      elevationProfileId: 'from_research',
      source: 'GLOBAL_DEM',
      computedAt: new Date().toISOString(),
    } as any;

    const flags = this.terrainRisk.evaluateRisks(terrainFactsLike);
    for (const flag of flags || []) {
      const sev = flag.severity === 'HIGH' ? 'WARNING' : flag.severity === 'MEDIUM' ? 'WARNING' : 'INFO';
      const mappedId = constraintIdFromTerrainRiskFlagType(flag.type);
      const violation =
        flag.type === 'STEEP_SLOPE' && mappedId
          ? {
              anchor: { constraintId: mappedId, ruleId: 'terrain_risk.steep_slope', policyId: 'DEFAULT_TERRAIN_POLICY' },
              entityRef: { type: 'SEGMENT' as const },
              metric: {
                cmp: 'LEQ' as const,
                actual: (terrainFactsLike as any)?.terrainStats?.maxSlopePct ?? 0,
                limit: (DEFAULT_TERRAIN_POLICY as any)?.riskThresholds?.steepSlopePct ?? 0,
                unit: 'pct',
                slack: ((DEFAULT_TERRAIN_POLICY as any)?.riskThresholds?.steepSlopePct ?? 0) - ((terrainFactsLike as any)?.terrainStats?.maxSlopePct ?? 0),
              },
              evidence: { source: 'DEM' as const },
              scope: 'LOCAL' as const,
            }
          : mappedId
            ? {
                anchor: { constraintId: mappedId, ruleId: `terrain_risk.${String(flag.type).toLowerCase()}`, policyId: 'DEFAULT_TERRAIN_POLICY' },
                entityRef: { type: 'DAY' as const },
                evidence: { source: 'DEM' as const },
                scope: 'GLOBAL' as const,
              }
            : undefined;
      findings.push({
        source: 'TERRAIN',
        severity: sev,
        code: `TERRAIN_${flag.type}`,
        message: flag.message,
        data: { severity: flag.severity },
        ...(violation ? { violation } : {}),
      });
    }

    return { findings };
  }

  private pickBlockingReason(findings: FeasibilityFinding[]): string {
    const hard = findings.find((f) => f.severity === 'BLOCK');
    if (hard) return hard.message;
    const warn = findings.find((f) => f.severity === 'WARNING');
    return warn?.message ?? 'Route is not feasible';
  }

  private computeRiskLevel(
    findings: FeasibilityFinding[],
    extra: { executabilityScore?: number; fatigueScore: number },
  ): number {
    let score = 0;
    for (const f of findings) {
      if (f.severity === 'BLOCK') score += 35;
      else if (f.severity === 'WARNING') score += 12;
      else score += 2;
    }

    // Lower executability increases risk
    if (typeof extra.executabilityScore === 'number') {
      score += clamp01To100((70 - extra.executabilityScore) / 70 * 20);
    }

    // Fatigue contributes directly
    score += clamp01To100(extra.fatigueScore / 100 * 20);

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}

function clamp01To100(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x * 100)));
}

