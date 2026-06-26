/**
 * VerifyExecutorService
 *
 * 实现 IVerifyExecutor，执行 VERIFY 阶段
 *
 * 注：本阶段对 transport.search 的调用均使用行程项内嵌坐标对象；若新增「字符串型」起终点，
 * 请复用 `transport-endpoint-hydration.util` 与 Research 路径保持一致。
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
import { buildAxiomMatchContext } from '../axioms/build-axiom-match-context.util';
import { buildL3ProofPrefixFromMatch } from '../axioms/axiom-l3-proof.util';
import { matchAxioms } from '../axioms/axiom-matchers';
import { AXIOM_REGISTRY } from '../axioms/axiom-registry';
import { ExperienceAgentService } from '../services/domain-agents/experience-agent.service';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import { RouteFeasibilityEngineService } from '../services/route-feasibility-engine.service';
import { classifyVerificationIssueFromText } from './verification-issue.rules';
import type { ConstraintViolation, FeasibilityFinding } from '../services/route-feasibility.types';
import { CONSTRAINT_IDS } from '../services/constraint-registry';
import type { IcelandVehicleIntentHints } from '../../skills/itinerary/iceland-vehicle-terrain-arbitrator.util';
import { WorldDecisionMemoryService } from '../memory/decision-memory/world-decision-memory.service';
import {
  buildTerrainFroadUnfitAxiomDecisionMemory,
  pickLastVehicleAcceptedCausalityIds,
} from '../memory/decision-memory/vehicle-terrain-decision-memory.util';
import { hydrateOpeningHoursEvidenceForItinerary } from '../utils/opening-hours-evidence-hydration.util';
import {
  dataReliabilityFindingsToVerificationIssues,
  evaluateDataReliability,
} from './data-reliability-gate';
import {
  evaluateRiskEvents,
  riskEventsToVerificationIssues,
} from './risk-event-gate';
import { ValidationGatewayService } from '../../decision/validation-gateway/validation-gateway.service';
import { ValidationGatewayExtensionService } from '../../decision/validation-gateway/validation-gateway-extension.service';

const VG_SKIP_LEGACY = '__vg_rfe_complete';


@Injectable()
export class VerifyExecutorService implements IVerifyExecutor {
  private readonly logger = new Logger(VerifyExecutorService.name);

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly experienceAgent?: ExperienceAgentService,
    @Optional() private readonly routeFeasibility?: RouteFeasibilityEngineService,
    @Optional() private readonly worldDecisionMemory?: WorldDecisionMemoryService,
    @Optional() private readonly validationGateway?: ValidationGatewayService,
    @Optional() private readonly validationGatewayExt?: ValidationGatewayExtensionService,
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
    const overrideBuf = Number((dso.environmentState as any)?.twilightBufferMin);
    const buf =
      Number.isFinite(overrideBuf) && overrideBuf > 0
        ? overrideBuf
        : Number(process.env.DECISION_REPAIR_TWILIGHT_BUFFER_MIN ?? '');
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

    if (!this.validationGateway) {
      return this.executeLegacy(dso, ctx);
    }

    const hints = this.buildVerifyHints(ctx);
    const result = await this.validationGateway.runStages(
      { dso, ctx, recordSlo: true },
      [
        {
          stageId: 'DATA_RELIABILITY',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) =>
            this.stageDataReliability(s, c, issues, confidenceDelta),
        },
        {
          stageId: 'RISK_EVENTS',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) =>
            this.stageRiskEvents(s, c, issues, confidenceDelta),
        },
        {
          stageId: 'AXIOM_PROJECTION',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) =>
            this.stageAxiomProjection(s, c, issues, confidenceDelta),
        },
        {
          stageId: 'PHYSICAL_ONTOLOGY',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) => {
            if (!this.validationGatewayExt) {
              return { issues, confidenceDelta, skipped: true };
            }
            return this.validationGatewayExt.stagePhysicalOntology(s, c, issues, confidenceDelta);
          },
        },
        {
          stageId: 'ROUTE_FEASIBILITY',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) =>
            this.stageRouteFeasibility(s, c, issues, confidenceDelta, hints),
        },
        {
          stageId: 'SUNSET_TIMELINE',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) => {
            if (this.isRfeComplete(c)) {
              return { issues, confidenceDelta, skipped: true };
            }
            return this.stageSunsetOnly(s, c, issues, confidenceDelta);
          },
        },
        {
          stageId: 'ITINERARY_VERIFY_SKILL',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) => {
            if (this.isRfeComplete(c)) {
              return { issues, confidenceDelta, skipped: true };
            }
            return this.stageItineraryVerify(s, c, issues, confidenceDelta, hints);
          },
        },
        {
          stageId: 'EXPERIENCE_AGENT',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) => {
            if (this.isRfeComplete(c)) {
              return { issues, confidenceDelta, skipped: true };
            }
            return this.stageExperienceAgent(s, c, issues, confidenceDelta);
          },
        },
        {
          stageId: 'KPU_OUTPUT_CHECK',
          run: async ({ dso: s, ctx: c, issues, confidenceDelta }) => {
            if (!this.validationGatewayExt) {
              return { issues, confidenceDelta, skipped: true };
            }
            return this.validationGatewayExt.stageKpuOutputCheck(s, c, issues, confidenceDelta);
          },
        },
      ],
    );

    let { issues, confidenceDelta } = result;
    if (issues.length > 0 && confidenceDelta === 0) {
      confidenceDelta = -0.1 * Math.min(issues.length, 5);
    }

    if (ctx.itinerary) {
      ctx.itinerary.metadata = {
        ...(ctx.itinerary.metadata ?? {}),
        __validation_gateway: {
          passed: result.passed,
          durationMs: result.durationMs,
          stages: result.stages,
        },
      };
    }

    return { issues, confidenceDelta };
  }

  private isRfeComplete(ctx: PhaseExecutorContext): boolean {
    return (ctx.itinerary?.metadata as Record<string, unknown> | undefined)?.[VG_SKIP_LEGACY] === true;
  }

  private markRfeComplete(ctx: PhaseExecutorContext): void {
    if (!ctx.itinerary) return;
    ctx.itinerary.metadata = { ...(ctx.itinerary.metadata ?? {}), [VG_SKIP_LEGACY]: true };
  }

  private buildVerifyHints(ctx: PhaseExecutorContext): {
    verifyUserQuery?: string;
    verifyIntentHints?: IcelandVehicleIntentHints;
  } {
    const verifyUserQuery = (() => {
      const m = String((ctx.tripPlanRequest as any)?.message ?? '').trim();
      if (m) return m;
      const msgs = Array.isArray(ctx.recent_messages)
        ? ctx.recent_messages.filter((x): x is string => typeof x === 'string')
        : [];
      const last = msgs.length ? msgs[msgs.length - 1].trim() : '';
      return last || undefined;
    })();

    const verifyIntentHints: IcelandVehicleIntentHints | undefined = (() => {
      const hints: IcelandVehicleIntentHints = {};
      const vt = ctx.tripPlanRequest?.constraints?.vehicle_type;
      if (vt === '2WD' || vt === '4WD') hints.constraints_vehicle_type = vt;
      const profileTp = String(ctx.user_profile?.preferences?.transport_preferences ?? '').trim();
      if (profileTp) {
        hints.preference_text = profileTp;
        if (!hints.transport_preferences) hints.transport_preferences = profileTp;
      }
      return Object.keys(hints).length > 0 ? hints : undefined;
    })();

    return { verifyUserQuery, verifyIntentHints };
  }

  private async stageDataReliability(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ) {
    const reliability = evaluateDataReliability(dso, ctx);
    if (ctx.itinerary) {
      ctx.itinerary.metadata = {
        ...(ctx.itinerary.metadata ?? {}),
        __data_reliability: {
          evidence_count: reliability.evidence.length,
          finding_count: reliability.findings.length,
          confidence_delta: reliability.confidenceDelta,
          disclosure: reliability.disclosure,
          findings: reliability.findings,
        },
      };
    }
    const next = [...issues];
    if (reliability.findings.length > 0) {
      next.push(...dataReliabilityFindingsToVerificationIssues(reliability.findings));
    }
    return { issues: next, confidenceDelta: confidenceDelta + reliability.confidenceDelta };
  }

  private async stageRiskEvents(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ) {
    const riskGate = evaluateRiskEvents(dso, ctx);
    if (ctx.itinerary) {
      ctx.itinerary.metadata = { ...(ctx.itinerary.metadata ?? {}), __risk_audit: riskGate.audit };
    }
    const next = [...issues];
    if (riskGate.events.length > 0) {
      next.push(...riskEventsToVerificationIssues(riskGate.events));
    }
    return { issues: next, confidenceDelta: confidenceDelta + riskGate.confidenceDelta };
  }

  private async stageAxiomProjection(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ) {
    const next = [...issues];
    let delta = confidenceDelta;
    try {
      const message = String((ctx.tripPlanRequest as any)?.message ?? '').trim();
      const constraints = (ctx.tripPlanRequest as any)?.constraints as Record<string, any> | undefined;
      const matches = matchAxioms({ message, constraints });
      const terrain = matches.find((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT');
      if (terrain) {
        const now = new Date().toISOString();
        const terrainMsg =
          `[L3-PROOF|${terrain.axiom.cid}|DESTINATION:${ctx.requestId}|cmp:GEQ|actual:2|limit:4|unit:WD|slack:-2|evidence:MODEL:intent_froad] ` +
          `意图要求 F-road/高地，但车辆为 2WD（冰岛高地普遍要求 4WD），物理上不可执行。`;
        next.push({
          code: 'TERRAIN_F_ROAD_UNFIT',
          class: 'CONFLICT',
          message: terrainMsg,
          source: 'ROUTE_FEASIBILITY',
          at: now,
          entityRef: {
            type: 'DESTINATION',
            id: String((ctx.tripPlanRequest as any)?.destination ?? '') || ctx.requestId,
          },
          suggestedActions: [
            { action: 'RELAX', detail: '升级车辆至 4WD 或取消 F-road/高地路段' },
            { action: 'ASK_USER', detail: '确认是否自担风险继续（可能仍无解）' },
          ],
        });
        this.worldDecisionMemory?.append(
          buildTerrainFroadUnfitAxiomDecisionMemory({
            axiomCid: terrain.axiom.cid,
            message: terrainMsg,
            priorCausalityIds: pickLastVehicleAcceptedCausalityIds(this.worldDecisionMemory),
          }),
        );
        delta -= 0.25;
      }
    } catch {
      // best-effort
    }
    return { issues: next, confidenceDelta: delta };
  }

  private async stageRouteFeasibility(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
    hints: ReturnType<VerifyExecutorService['buildVerifyHints']>,
  ) {
    if (!this.routeFeasibility || !ctx.itinerary) {
      return { issues, confidenceDelta, skipped: true };
    }
    const next = [...issues];
    let delta = confidenceDelta;
    try {
      const userProfile = this.deriveUserProfile(ctx);
      const out = await this.routeFeasibility.evaluate({
        itinerary: ctx.itinerary as unknown as Itinerary,
        userProfile: {
          fitness_level: userProfile.fitness_level,
          risk_tolerance:
            (ctx.tripPlanRequest?.party_profile?.risk_tolerance?.toString().toUpperCase() as any) ?? undefined,
        },
        researchData: (ctx.researchData ?? {}) as any,
        ...(hints.verifyUserQuery ? { user_query: hints.verifyUserQuery } : {}),
        ...(hints.verifyIntentHints ? { intent_hints: hints.verifyIntentHints } : {}),
        environment: {
          month: dso.environmentState?.month,
          weather: { wind_speed_mps: (dso.environmentState as any)?.weather?.wind_speed_mps },
        },
      });

      for (const f of out.findings ?? []) {
        const v = this.mapFeasibilityFindingToVerificationIssue(f);
        if (v) next.push(v);
      }
      if ((out.findings ?? []).length === 0) {
        for (const raw of out.issues ?? []) {
          const v = classifyVerificationIssueFromText({ text: String(raw ?? ''), source: 'ROUTE_FEASIBILITY' });
          if (v) next.push(v);
        }
      }

      if (!out.result.is_feasible) delta -= 0.2;
      else if (out.result.risk_level >= 70) delta -= 0.1;
      else if (out.result.risk_level >= 50) delta -= 0.05;

      const sunsetIssues = await this.collectSunsetTimelineIssues(dso, ctx);
      for (const si of sunsetIssues) {
        const dup = next.some(
          (x) => x.code === 'SUNSET_BREACH' && x.entityRef?.type === 'DAY' && x.entityRef?.id === si.entityRef?.id,
        );
        if (!dup) next.push(si);
      }
      if (sunsetIssues.length > 0) delta -= 0.12;

      this.markRfeComplete(ctx);
      return { issues: next, confidenceDelta: delta };
    } catch (e: any) {
      this.logger.warn(`[VerifyExecutor] RouteFeasibilityEngine 失败: ${e?.message}`);
      return { issues: next, confidenceDelta: delta, error: e?.message };
    }
  }

  private async stageSunsetOnly(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ) {
    if (!ctx.itinerary) return { issues, confidenceDelta, skipped: true };
    const next = [...issues];
    let delta = confidenceDelta;
    const sunsetIssues = await this.collectSunsetTimelineIssues(dso, ctx);
    for (const si of sunsetIssues) {
      const dup = next.some(
        (x) => x.code === 'SUNSET_BREACH' && x.entityRef?.type === 'DAY' && x.entityRef?.id === si.entityRef?.id,
      );
      if (!dup) next.push(si);
    }
    if (sunsetIssues.length > 0) delta -= 0.12;
    return { issues: next, confidenceDelta: delta };
  }

  private async stageItineraryVerify(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
    hints: ReturnType<VerifyExecutorService['buildVerifyHints']>,
  ) {
    if (!this.skillsRegistry || !ctx.itinerary) {
      return { issues, confidenceDelta, skipped: true };
    }
    const next = [...issues];
    let delta = confidenceDelta;
    try {
      const skill = this.skillsRegistry.getSkill('itinerary.verify');
      if (!skill) return { issues: next, confidenceDelta: delta, skipped: true };
      const result = await skill.execute({
        itinerary: ctx.itinerary as any,
        research_data: ctx.researchData,
        ...(hints.verifyUserQuery ? { user_query: hints.verifyUserQuery } : {}),
        ...(hints.verifyIntentHints ? { intent_hints: hints.verifyIntentHints } : {}),
      });
      if (result?.issues && Array.isArray(result.issues)) {
        for (const raw of result.issues) {
          const v = classifyVerificationIssueFromText({ text: String(raw ?? ''), source: 'ITINERARY_VERIFY_SKILL' });
          if (v) next.push(v);
        }
        delta += -0.1 * Math.min(result.issues.length, 5);
      }
    } catch (e: any) {
      this.logger.warn(`[VerifyExecutor] itinerary.verify 失败: ${e?.message}`);
      next.push({
        code: 'UNKNOWN',
        class: 'CONFLICT',
        message: e?.message || '验证失败',
        source: 'ITINERARY_VERIFY_SKILL',
        at: new Date().toISOString(),
      });
      delta += -0.2;
    }
    return { issues: next, confidenceDelta: delta };
  }

  private async stageExperienceAgent(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    issues: VerificationIssue[],
    confidenceDelta: number,
  ) {
    if (!this.experienceAgent || !ctx.itinerary || !this.hasValidItinerary(ctx.itinerary)) {
      return { issues, confidenceDelta, skipped: true };
    }
    const next = [...issues];
    let delta = confidenceDelta;
    try {
      const userProfile = this.deriveUserProfile(ctx);
      const execResult = await this.experienceAgent.assessHumanExecutability(
        ctx.itinerary as unknown as Itinerary,
        userProfile,
      );
      const severeChallenges = (execResult.challenge_points || []).filter(
        (c) => c.severity === 'DIFFICULT' || c.severity === 'EXTREME',
      );
      for (const c of severeChallenges) {
        next.push({
          code: 'FATIGUE_HIGH',
          class: c.severity === 'EXTREME' ? 'CONFLICT' : 'ADVISORY',
          message: `[体验评估] ${c.challenge} (${c.severity})，建议：${c.adaptation}`,
          source: 'EXPERIENCE_AGENT',
          at: new Date().toISOString(),
        });
      }
      if (execResult.executability_score < 50) {
        delta -= 0.15;
        next.push({
          code: 'ROUTE_INFEASIBLE',
          class: 'CONFLICT',
          message: `[体验评估] 人体可执行性较低 (${execResult.executability_score}/100)，行程强度可能超过用户体能`,
          source: 'EXPERIENCE_AGENT',
          at: new Date().toISOString(),
        });
      } else if (execResult.executability_score < 70 && severeChallenges.length > 0) {
        delta -= 0.05;
      }
    } catch (e: any) {
      this.logger.warn(`[VerifyExecutor] ExperienceAgent 失败: ${e?.message}`);
    }
    return { issues: next, confidenceDelta: delta };
  }

  /** Gateway 未注入时的回退路径（测试 / 轻量模块） */
  private async executeLegacy(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{ issues: VerificationIssue[]; confidenceDelta: number }> {
    const issues: VerificationIssue[] = [];
    let confidenceDelta = 0;

    const reliability = evaluateDataReliability(dso, ctx);
    if (ctx.itinerary) {
      ctx.itinerary.metadata = {
        ...(ctx.itinerary.metadata ?? {}),
        __data_reliability: {
          evidence_count: reliability.evidence.length,
          finding_count: reliability.findings.length,
          confidence_delta: reliability.confidenceDelta,
          disclosure: reliability.disclosure,
          findings: reliability.findings,
        },
      };
    }
    if (reliability.findings.length > 0) {
      issues.push(...dataReliabilityFindingsToVerificationIssues(reliability.findings));
      confidenceDelta += reliability.confidenceDelta;
    }

    const riskGate = evaluateRiskEvents(dso, ctx);
    if (ctx.itinerary) {
      ctx.itinerary.metadata = {
        ...(ctx.itinerary.metadata ?? {}),
        __risk_audit: riskGate.audit,
      };
    }
    if (riskGate.events.length > 0) {
      issues.push(...riskEventsToVerificationIssues(riskGate.events));
      confidenceDelta += riskGate.confidenceDelta;
    }

    const verifyUserQuery = (() => {
      const m = String((ctx.tripPlanRequest as any)?.message ?? '').trim();
      if (m) return m;
      const msgs = Array.isArray(ctx.recent_messages)
        ? ctx.recent_messages.filter((x): x is string => typeof x === 'string')
        : [];
      const last = msgs.length ? msgs[msgs.length - 1].trim() : '';
      return last || undefined;
    })();

    const verifyIntentHints: IcelandVehicleIntentHints | undefined = (() => {
      const hints: IcelandVehicleIntentHints = {};
      const vt = ctx.tripPlanRequest?.constraints?.vehicle_type;
      if (vt === '2WD' || vt === '4WD') hints.constraints_vehicle_type = vt;

      const profileTp = String(ctx.user_profile?.preferences?.transport_preferences ?? '').trim();
      if (profileTp) {
        hints.preference_text = profileTp;
        if (!hints.transport_preferences) hints.transport_preferences = profileTp;
      }

      return Object.keys(hints).length > 0 ? hints : undefined;
    })();

    // A. 显式约束投影（Constraint Projection）
    // 即便路径/POI 尚未完整编排，只要用户意图明确包含 F-road/高地，且车辆为 2WD，则必须给出 HARD 级别 terrain 证据。
    try {
      const message = String((ctx.tripPlanRequest as any)?.message ?? '').trim();
      const constraints = (ctx.tripPlanRequest as any)?.constraints as Record<string, any> | undefined;
      const clarAnswers = (ctx.tripPlanRequest as { clarification_answers?: unknown })?.clarification_answers;
      const matches = matchAxioms(
        buildAxiomMatchContext({
          message,
          constraints,
          trip: ctx.tripPlanRequest as any,
          tripId: ctx.requestId,
          itinerary: ctx.itinerary as any,
          clarificationAnswers: Array.isArray(clarAnswers) ? (clarAnswers as any) : undefined,
        }),
      );
      const terrain = matches.find((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT');
      if (terrain) {
        const now = new Date().toISOString();
        const terrainMsg =
          `${buildL3ProofPrefixFromMatch(terrain, `DESTINATION:${ctx.requestId}`)} ` +
          `意图要求 F-road/高地，但车辆为 2WD（冰岛高地普遍要求 4WD），物理上不可执行。`;
        issues.push({
          code: 'TERRAIN_F_ROAD_UNFIT',
          class: 'CONFLICT',
          // L3 proof-carrying prefix for dominant_cid + formal_proof_audit extraction
          message: terrainMsg,
          source: 'ROUTE_FEASIBILITY',
          at: now,
          entityRef: { type: 'DESTINATION', id: String((ctx.tripPlanRequest as any)?.destination ?? '') || ctx.requestId },
          suggestedActions: [
            { action: 'RELAX', detail: '升级车辆至 4WD 或取消 F-road/高地路段' },
            { action: 'ASK_USER', detail: '确认是否自担风险继续（可能仍无解）' },
          ],
        });
        this.worldDecisionMemory?.append(
          buildTerrainFroadUnfitAxiomDecisionMemory({
            axiomCid: terrain.axiom.cid,
            message: terrainMsg,
            priorCausalityIds: pickLastVehicleAcceptedCausalityIds(this.worldDecisionMemory),
          }),
        );
        confidenceDelta -= 0.25;
      }
    } catch {
      // best-effort only
    }

    // 0a. VERIFY 前从 Place DB 补全 opening_hours_evidence（须在 RouteFeasibility / itinerary.verify 之前）
    if (this.skillsRegistry && ctx.itinerary && ctx.researchData && typeof ctx.researchData === 'object') {
      const ohSkill = this.skillsRegistry.getSkill('opening_hours.get');
      if (ohSkill) {
        try {
          const hydrated = await hydrateOpeningHoursEvidenceForItinerary({
            itinerary: ctx.itinerary as Itinerary,
            researchData: ctx.researchData as Record<string, unknown>,
            openingHoursSkill: ohSkill as {
              execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }>;
            },
          });
          if (hydrated.fetched > 0) {
            this.logger.debug(
              `[VerifyExecutor] opening_hours pre-feasibility hydrate: fetched=${hydrated.fetched} total=${hydrated.merged}`,
            );
          }
        } catch (e: unknown) {
          this.logger.warn(
            `[VerifyExecutor] opening_hours pre-feasibility hydrate skipped: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }
    }

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
          ...(verifyUserQuery ? { user_query: verifyUserQuery } : {}),
          ...(verifyIntentHints ? { intent_hints: verifyIntentHints } : {}),
          environment: {
            month: dso.environmentState?.month,
            weather: {
              wind_speed_mps: (dso.environmentState as any)?.weather?.wind_speed_mps,
            },
          },
        });

        // RouteFeasibilityEngine: prefer proof-carrying findings -> structured issues; only fall back to text classification.
        for (const f of out.findings ?? []) {
          const v = this.mapFeasibilityFindingToVerificationIssue(f);
          if (v) issues.push(v);
        }
        if ((out.findings ?? []).length === 0) {
          for (const raw of out.issues ?? []) {
            const v = classifyVerificationIssueFromText({ text: String(raw ?? ''), source: 'ROUTE_FEASIBILITY' });
            if (v) issues.push(v);
          }
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
        const researchData =
          ctx.researchData && typeof ctx.researchData === 'object'
            ? ({ ...(ctx.researchData as Record<string, unknown>) } as Record<string, unknown>)
            : ({} as Record<string, unknown>);
        const ohSkill = this.skillsRegistry.getSkill('opening_hours.get');
        if (ohSkill) {
          try {
            const hydrated = await hydrateOpeningHoursEvidenceForItinerary({
              itinerary: ctx.itinerary as Itinerary,
              researchData,
              openingHoursSkill: ohSkill as {
                execute: (input: { poi_ids: string[] }) => Promise<{ opening_hours?: unknown[] }>;
              },
            });
            if (hydrated.fetched > 0) {
              this.logger.debug(
                `[VerifyExecutor] opening_hours hydrated: fetched=${hydrated.fetched} total=${hydrated.merged}`,
              );
            }
          } catch (e: unknown) {
            this.logger.warn(
              `[VerifyExecutor] opening_hours pre-hydrate skipped: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }

        const skill = this.skillsRegistry.getSkill('itinerary.verify');
        if (skill) {
          const result = await skill.execute({
            itinerary: ctx.itinerary as any,
            research_data: researchData,
            ...(verifyUserQuery ? { user_query: verifyUserQuery } : {}),
            ...(verifyIntentHints ? { intent_hints: verifyIntentHints } : {}),
          });

          if (result?.issues && Array.isArray(result.issues)) {
            for (const raw of result.issues) {
              const text =
                typeof raw === 'string'
                  ? raw
                  : raw && typeof raw === 'object' && typeof (raw as { message?: string }).message === 'string'
                    ? (raw as { message: string }).message
                    : '';
              const v = classifyVerificationIssueFromText({ text, source: 'ITINERARY_VERIFY_SKILL' });
              if (v) issues.push(v);
            }
            confidenceDelta += -0.1 * Math.min(result.issues.length, 5);
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
        confidenceDelta += -0.2;
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

  private mapFeasibilityFindingToVerificationIssue(f: FeasibilityFinding): VerificationIssue | undefined {
    if (!f) return undefined;
    const now = new Date().toISOString();

    const source: VerificationIssue['source'] = 'ROUTE_FEASIBILITY';
    const issueClass: VerificationIssue['class'] =
      f.severity === 'BLOCK' ? 'CONFLICT' : f.severity === 'WARNING' ? 'ADVISORY' : 'ADVISORY';

    // L3 path: structured violation -> deterministic mapping + proof-carrying message prefix
    if (f.violation) {
      const mappedCode = this.mapConstraintIdToVerificationIssueCode(f.violation);
      const msg = this.formatL3ProofMessage({ violation: f.violation, human: f.message });
      return {
        code: mappedCode,
        class: issueClass,
        message: msg,
        source,
        at: now,
        entityRef: f.violation.entityRef,
        suggestedActions: f.violation.suggestedActions,
        confidence01: 0.95,
      };
    }

    // L1 fallback: classify from text (finding.message only, no RFE issues[] dependency)
    const v = classifyVerificationIssueFromText({ text: String(f.message ?? ''), source });
    if (!v) return undefined;
    return v;
  }

  private mapConstraintIdToVerificationIssueCode(v: ConstraintViolation): VerificationIssue['code'] {
    const id = v.anchor?.constraintId ?? '';
    switch (id) {
      // terrain.*
      case CONSTRAINT_IDS.TERRAIN_MAX_DAILY_ASCENT_M:
        return 'FATIGUE_OVERLOAD';
      case CONSTRAINT_IDS.TERRAIN_MAX_SLOPE_PCT:
      case CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY:
        return 'ROUTE_INFEASIBLE';

      // time_space.*
      case CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY:
        return 'ROUTE_INFEASIBLE';
      case CONSTRAINT_IDS.TIME_SPACE_MAX_DRIVING_HOURS:
        return 'FATIGUE_OVERLOAD';
      case CONSTRAINT_IDS.TIME_SPACE_MIN_TRANSFER_BUFFER:
        return 'TIME_WINDOW_BREACH';

      // entity.*
      case CONSTRAINT_IDS.ENTITY_OPENING_HOURS_OVERLAP:
      case CONSTRAINT_IDS.ENTITY_SEASONAL_CLOSURE:
        return 'POI_CLOSED';
      case CONSTRAINT_IDS.ENTITY_MANDATORY_RESERVATION:
        return 'TIME_WINDOW_BREACH';

      // environment.*
      case CONSTRAINT_IDS.ENVIRONMENT_WIND_SPEED_LIMIT:
      case CONSTRAINT_IDS.ENVIRONMENT_EXTREME_WEATHER_CLOSURE:
        return 'WEATHER_RISK';
      case CONSTRAINT_IDS.ENVIRONMENT_VISIBILITY_SUNSET_BUFFER:
        return 'SUNSET_BREACH';

      default:
        return 'UNKNOWN';
    }
  }

  private formatL3ProofMessage(params: { violation: ConstraintViolation; human?: string }): string {
    const { violation, human } = params;
    const a = violation.anchor;
    const e = violation.entityRef;
    const m = violation.metric;
    const evid = violation.evidence;
    const entity = e ? `${e.type}:${e.id ?? ''}` : 'OTHER:';
    const metric =
      m && Number.isFinite(m.actual) && Number.isFinite(m.limit) && Number.isFinite(m.slack)
        ? `cmp:${m.cmp}|actual:${m.actual}|limit:${m.limit}|unit:${m.unit}|slack:${m.slack}`
        : 'cmp:LEQ|actual:|limit:|unit:|slack:';
    const ev = evid?.source ? `|evidence:${evid.source}${evid.refIds?.length ? `:${evid.refIds.join(',')}` : ''}` : '';
    const cid = (() => {
      // Axiom-driven attribution: map certain raw constraintIds to axiom cids
      switch (a.constraintId) {
        case CONSTRAINT_IDS.TIME_SPACE_MAX_DRIVING_HOURS:
          return AXIOM_REGISTRY.FATIGUE_OVERLOAD.cid;
        case CONSTRAINT_IDS.TIME_SPACE_ETA_FEASIBILITY:
          return AXIOM_REGISTRY.ETA_INFEASIBLE.cid;
        case CONSTRAINT_IDS.TERRAIN_F_ROAD_COMPATIBILITY:
          return AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT.cid;
        default:
          return a.constraintId;
      }
    })();
    const prefix = `[L3-PROOF|${cid}|${entity}|${metric}${ev}]`;
    const tail = human && String(human).trim() ? ` ${String(human).trim()}` : '';
    return `${prefix}${tail}`;
  }
}
