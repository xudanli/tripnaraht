/**
 * VerifyExecutorService
 *
 * 实现 IVerifyExecutor，执行 VERIFY 阶段
 * 1. 调用 itinerary.verify Skill
 * 2. 调用 ExperienceAgent.assessHumanExecutability（专利实施例：体验与人体可执行性评估）
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { DecisionState, VerificationIssue } from '../../decision/kernel/decision-state.types';
import type { IVerifyExecutor, PhaseExecutorContext } from '../../decision/kernel/interfaces/phase-executor.interface';
import { normalizeItem } from '../../decision/kernel/itinerary.types';
import { solveDayTimeline, type SolveDayTimelineEnvironment } from '../../decision/kernel/itinerary-timeline.util';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { ExperienceAgentService } from '../services/domain-agents/experience-agent.service';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import { RouteFeasibilityEngineService } from '../services/route-feasibility-engine.service';
import { classifyVerificationIssueFromText } from './verification-issue.rules';

@Injectable()
export class VerifyExecutorService implements IVerifyExecutor {
  private readonly logger = new Logger(VerifyExecutorService.name);

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
    @Optional() private readonly routeFeasibility?: RouteFeasibilityEngineService,
  ) {}

  /** 与 RepairExecutor.buildTimelineEnvironment 对齐：VERIFY 硬判定日落可行性 */
  private buildVerifyTimelineEnvironment(dso: DecisionState): SolveDayTimelineEnvironment | undefined {
    const raw = dso.environmentState?.daylightByDate as Record<string, { sunset?: string; civil_dusk?: string }> | undefined;
    if (!raw || typeof raw !== 'object') return undefined;
    const sunsetByDate: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      const s = v?.sunset ?? v?.civil_dusk;
      if (typeof s === 'string' && s.trim()) sunsetByDate[k] = s.trim();
    }
    if (Object.keys(sunsetByDate).length === 0) return undefined;
    const buf = Number(process.env.DECISION_REPAIR_TWILIGHT_BUFFER_MIN ?? '');
    return {
      sunsetByDate,
      ...(Number.isFinite(buf) && buf > 0 ? { twilightBufferMin: Math.round(buf) } : {}),
    };
  }

  private async estimateAdjacentEtaMinVerify(items: any[], ctx: PhaseExecutorContext): Promise<number[]> {
    const n = Math.max(0, items.length - 1);
    const etaMin = new Array(n).fill(30);
    if (!this.skillsRegistry || n === 0) return etaMin;
    const transport = this.skillsRegistry.getSkill('transport.search');
    if (!transport) return etaMin;
    const coords = items.map((it) => {
      const prof = normalizeItem(it, {});
      return prof?.location ? { lat: prof.location.lat, lng: prof.location.lng } : undefined;
    });
    if (coords.some((c) => !c)) return etaMin;
    try {
      const pairs = coords.slice(0, -1).map((c, i) => ({ a: c!, b: coords[i + 1]! }));
      const results = await Promise.allSettled(
        pairs.map((p) =>
          transport.execute({
            origin: { lat: p.a.lat, lng: p.a.lng },
            destination: { lat: p.b.lat, lng: p.b.lng },
            mode: (ctx.tripPlanRequest?.mode ?? 'drive') as any,
          } as any),
        ),
      );
      return results.map((r) => {
        if (r.status !== 'fulfilled') return 30;
        const best = (r.value as any)?.best_option;
        const mins = best?.duration_minutes ?? (r.value as any)?.options?.[0]?.duration_minutes;
        return typeof mins === 'number' && Number.isFinite(mins) ? Math.max(0, Math.round(mins)) : 30;
      });
    } catch {
      return etaMin;
    }
  }

  private async collectSunsetTimelineIssues(dso: DecisionState, ctx: PhaseExecutorContext): Promise<VerificationIssue[]> {
    const out: VerificationIssue[] = [];
    const env = this.buildVerifyTimelineEnvironment(dso);
    if (!env || !ctx.itinerary?.days?.length) return out;
    const now = new Date().toISOString();
    for (let dayIdx = 0; dayIdx < ctx.itinerary.days.length; dayIdx++) {
      const day = (ctx.itinerary.days as any[])[dayIdx];
      const items: any[] = Array.isArray(day?.items) ? day.items : [];
      if (items.length < 2) continue;
      const coords = items.map((it) => {
        const prof = normalizeItem(it, {});
        return prof?.location ? { lat: prof.location.lat, lng: prof.location.lng } : undefined;
      });
      if (coords.some((c) => !c)) continue;
      const etaMin = await this.estimateAdjacentEtaMinVerify(items, ctx);
      try {
        const solved = solveDayTimeline({
          day: { date: String(day.date), items: items as any },
          adjacentEtaMin: etaMin,
          environment: env,
          dryRun: true,
        });
        if (
          solved.ok &&
          solved.feasibility.status === 'LIMIT_REACHED' &&
          solved.feasibility.violation === 'SUNSET'
        ) {
          const dayDate = String(day.date);
          out.push({
            code: 'SUNSET_BREACH',
            class: 'CONFLICT',
            message: `[时间线] ${dayDate} 户外行程无法在日落可视窗口内完成${solved.feasibility.bottleneckNodeId ? `（瓶颈：${solved.feasibility.bottleneckNodeId}）` : ''}。`,
            source: 'ENVIRONMENTAL_CONSTRAINTS',
            at: now,
            entityRef: { type: 'DAY', id: dayDate },
            suggestedActions: [{ action: 'REORDER', detail: 'VERIFY dry-run: solveDayTimeline SUNSET LIMIT' }],
          });
        }
      } catch (e: any) {
        this.logger.debug(`[VerifyExecutor] sunset timeline sweep skipped: ${e?.message}`);
      }
    }
    return out;
  }

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ issues: VerificationIssue[]; confidenceDelta: number }> {
    this.logger.debug(`[VerifyExecutor] 执行 VERIFY 阶段 requestId=${ctx.requestId}`);

    const issues: VerificationIssue[] = [];
    let confidenceDelta = 0;

    // 0. RouteFeasibilityEngine（统一聚合：verify + fatigue + terrain + expert rules）
    if (this.routeFeasibility && ctx.itinerary) {
      try {
        const userProfile = this.deriveUserProfile(ctx);
        const out = await this.routeFeasibility.evaluate({
          itinerary: ctx.itinerary as unknown as Itinerary,
          userProfile: {
            fitness_level: userProfile.fitness_level,
            risk_tolerance: (ctx.tripPlanRequest?.party_profile?.risk_tolerance?.toString().toUpperCase() as any) ?? undefined,
          },
          researchData: (ctx.researchData ?? {}) as any,
          environment: {
            month: dso.environmentState?.month,
            weather: {
              wind_speed_mps: (dso.environmentState as any)?.weather?.wind_speed_mps,
            },
          },
        });

        // RouteFeasibilityEngine: issues[] as strings → structured issues（保守默认：CONFLICT/ADVISORY）
        for (const raw of out.issues ?? []) {
          const v = classifyVerificationIssueFromText({ text: String(raw ?? ''), source: 'ROUTE_FEASIBILITY' });
          if (v) issues.push(v);
        }

        // Confidence delta heuristic
        if (!out.result.is_feasible) {
          confidenceDelta -= 0.2;
        } else if (out.result.risk_level >= 70) {
          confidenceDelta -= 0.1;
        } else if (out.result.risk_level >= 50) {
          confidenceDelta -= 0.05;
        }

        const sunsetIssues = await this.collectSunsetTimelineIssues(dso, ctx);
        for (const si of sunsetIssues) {
          const dup = issues.some(
            (x) => x.code === 'SUNSET_BREACH' && x.entityRef?.type === 'DAY' && x.entityRef?.id === si.entityRef?.id,
          );
          if (!dup) issues.push(si);
        }
        if (sunsetIssues.length > 0) {
          confidenceDelta -= 0.12;
        }

        // If feasibility engine ran, we can skip the legacy duplicated calls below.
        return { issues, confidenceDelta };
      } catch (e: any) {
        this.logger.warn(`[VerifyExecutor] RouteFeasibilityEngine 失败: ${e?.message}`);
        // Fall back to legacy checks
      }
    } else if (ctx.itinerary) {
      const sunsetIssues = await this.collectSunsetTimelineIssues(dso, ctx);
      for (const si of sunsetIssues) {
        const dup = issues.some(
          (x) => x.code === 'SUNSET_BREACH' && x.entityRef?.type === 'DAY' && x.entityRef?.id === si.entityRef?.id,
        );
        if (!dup) issues.push(si);
      }
      if (sunsetIssues.length > 0) {
        confidenceDelta -= 0.12;
      }
    }

    // 1. itinerary.verify Skill
    if (this.skillsRegistry && ctx.itinerary) {
      try {
        const skill = this.skillsRegistry.getSkill('itinerary.verify');
        if (skill) {
          const result = await skill.execute({
            itinerary: ctx.itinerary as any,
            research_data: ctx.researchData,
          });

          if (result?.issues && Array.isArray(result.issues)) {
            for (const raw of result.issues) {
              const v = classifyVerificationIssueFromText({ text: String(raw ?? ''), source: 'ITINERARY_VERIFY_SKILL' });
              if (v) issues.push(v);
            }
            confidenceDelta = -0.1 * Math.min(issues.length, 5);
          }
        }
      } catch (e: any) {
        this.logger.warn(`[VerifyExecutor] itinerary.verify 失败: ${e?.message}`);
        issues.push({
          code: 'UNKNOWN',
          class: 'CONFLICT',
          message: e?.message || '验证失败',
          source: 'ITINERARY_VERIFY_SKILL',
          at: new Date().toISOString(),
        });
        confidenceDelta = -0.2;
      }
    }

    // 2. ExperienceAgent.assessHumanExecutability（专利实施例：体验评估）
    if (this.experienceAgent && ctx.itinerary && this.hasValidItinerary(ctx.itinerary)) {
      try {
        const userProfile = this.deriveUserProfile(ctx);
        const execResult = await this.experienceAgent.assessHumanExecutability(
          ctx.itinerary as unknown as Itinerary,
          userProfile,
        );

        // DIFFICULT/EXTREME 挑战点转为 issues
        const severeChallenges = (execResult.challenge_points || []).filter(
          (c) => c.severity === 'DIFFICULT' || c.severity === 'EXTREME',
        );
        for (const c of severeChallenges) {
          issues.push({
            code: c.severity === 'EXTREME' ? 'FATIGUE_HIGH' : 'FATIGUE_HIGH',
            class: c.severity === 'EXTREME' ? 'CONFLICT' : 'ADVISORY',
            message: `[体验评估] ${c.challenge} (${c.severity})，建议：${c.adaptation}`,
            source: 'EXPERIENCE_AGENT',
            at: new Date().toISOString(),
          });
        }

        // 可执行性得分过低时降低置信度
        if (execResult.executability_score < 50) {
          confidenceDelta -= 0.15;
          issues.push({
            code: 'ROUTE_INFEASIBLE',
            class: 'CONFLICT',
            message: `[体验评估] 人体可执行性较低 (${execResult.executability_score}/100)，行程强度可能超过用户体能`,
            source: 'EXPERIENCE_AGENT',
            at: new Date().toISOString(),
          });
        } else if (execResult.executability_score < 70 && severeChallenges.length > 0) {
          confidenceDelta -= 0.05;
        }

        this.logger.debug(
          `[VerifyExecutor] ExperienceAgent 可执行性=${execResult.executability_score} challenges=${severeChallenges.length}`,
        );
      } catch (e: any) {
        this.logger.warn(`[VerifyExecutor] ExperienceAgent.assessHumanExecutability 失败: ${e?.message}`);
      }
    }

    if (issues.length > 0 && confidenceDelta === 0) {
      confidenceDelta = -0.1 * Math.min(issues.length, 5);
    }

    return { issues, confidenceDelta };
  }

  private hasValidItinerary(itinerary: PhaseExecutorContext['itinerary']): boolean {
    return !!(itinerary?.days && Array.isArray(itinerary.days) && itinerary.days.length > 0);
  }

  private deriveUserProfile(ctx: PhaseExecutorContext): {
    fitness_level: 'LOW' | 'MEDIUM' | 'HIGH';
    age_group?: string;
    special_needs?: string[];
  } {
    const party = ctx.tripPlanRequest?.party;
    const profile = ctx.tripPlanRequest?.party_profile;
    const raw = (party?.fitness_level ?? profile?.fitness ?? 'medium')?.toString().toUpperCase();
    const fitness_level: 'LOW' | 'MEDIUM' | 'HIGH' =
      raw === 'LOW' || raw === 'HIGH' ? raw : 'MEDIUM';

    return {
      fitness_level,
      age_group: party?.has_elderly ? 'senior' : undefined,
      special_needs: [],
    };
  }
}
