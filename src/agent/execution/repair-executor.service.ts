/**
 * RepairExecutorService
 *
 * 实现 IRepairExecutor，执行 REPAIR 阶段
 * LocalInsightAgent.suggestAlternatives + repair.apply Skill
 *
 * 注：本阶段 transport.search 调用使用行程项坐标对象；字符串型端点须与 RESEARCH 共用
 * `transport-endpoint-hydration.util` 预检逻辑后再收口到 Skill。
 *
 * 参考: docs/KERNEL_BUSINESS_LOGIC_MIGRATION_PLAN.md
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  DecisionState,
  PendingMigrationRequest,
  RepairEscalationPlan,
  VerificationIssue,
  VerificationIssueCode,
} from '../../decision/kernel/decision-state.types';
import { haversineMeters, normalizeItem } from '../../decision/kernel/itinerary.types';
import {
  isOutdoorVisibilityConstrainedItem,
  addMinutes,
  parseItemWindow,
  solveDayTimeline,
  type SolveDayTimelineEnvironment,
} from '../../decision/kernel/itinerary-timeline.util';
import { isOpenAt } from '../../decision/kernel/opening-hours.util';
import type {
  IRepairExecutor,
  PhaseExecutorContext,
  ItineraryLike,
} from '../../decision/kernel/interfaces/phase-executor.interface';
import { SkillsRegistryService } from '../../skills/services/skills-registry.service';
import { matchAxioms } from '../axioms/axiom-matchers';
import { AXIOM_REGISTRY } from '../axioms/axiom-registry';
import { ClaudeLocalInsightAgentService } from '../services/sub-agents/local-insight-agent.service';
import type { TripPlanRequest, GateResult } from '../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { parseL3ProofPrefix } from '../utils/narrator-l3-persuasion.util';
import { formatRepairDeadlockAudit } from '../utils/repair-causal-explainer.util';
import { evaluateAltPath } from '../utils/terrain-reroute-evaluator.util';
import type { RepairReason, RepairTrace } from '../services/route-feasibility.types';
import { buildPoiSearchContext } from '../../planning-policy/utils/build-poi-search-context.util';
import {
  buildContextualPoiSearchQuerySuffix,
  filterPoisByRejectedIds,
} from '../../planning-policy/utils/contextual-poi-search-query.util';
import { buildReplacementRetrievalDecisionTrace } from '../../planning-policy/utils/build-retrieval-decision-trace.util';
import { detectItineraryGapsV1, gapRetrievalIntentQuerySuffix } from '../../planning-policy/utils/detect-itinerary-gaps.util';

@Injectable()
export class RepairExecutorService implements IRepairExecutor {
  private readonly logger = new Logger(RepairExecutorService.name);

  private static readonly OSCILLATION_MOVE_THRESHOLD = 3; // >2 times

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly localInsightAgent?: ClaudeLocalInsightAgentService,
    /**
     * Optional: terrain reroute engine (Michigan solver / routing backend).
     * v0 skeleton: if not injected, RerouteTactic is disabled and we safely fall back.
     */
    @Optional() private readonly terrainRerouteEngine?: {
      findAlternativePath: (input: {
        requestId: string;
        entityRefId?: string;
        avoidSlopePctGE?: number;
      }) => Promise<{
        slope_ok: boolean;
        slope_slack_pct?: number;
        delta_drive_min: number;
        delta_distance_km?: number;
        path_fingerprint: string;
        /**
         * Segment-level atomic patch (Minimal Perturbation).
         * - segment_id is the itinerary item id that owns this segment.
         * - distance/eta are ABSOLUTE values for the patched segment after reroute.
         */
        patch?: {
          segment_id: string;
          encoded_polyline?: string;
          distance_meters?: number;
          eta_minutes?: number;
        };
      } | null>;
    },
  ) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    itinerary?: ItineraryLike;
    repairApplied: boolean;
    repairTraces?: RepairTrace[];
    escalationPlan?: RepairEscalationPlan;
    postRepairAdvisories?: VerificationIssue[];
    pendingMigrations?: PendingMigrationRequest[];
    recoverySignal?: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION';
  }> {
    this.logger.debug(`[RepairExecutor] 执行 REPAIR 阶段 requestId=${ctx.requestId}`);

    let repairApplied = false;
    let itinerary = ctx.itinerary;
    let escalationPlan: RepairEscalationPlan | undefined;
    const postRepairAdvisories: VerificationIssue[] = [];
    const pendingMigrations: PendingMigrationRequest[] = [];
    let recoverySignal: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION' | undefined;
    const repairTraces: RepairTrace[] = [];

    if (!ctx.tripPlanRequest || !ctx.gateResult) {
      return { itinerary, repairApplied, escalationPlan, postRepairAdvisories: undefined };
    }

    const hasLowBudgetDirective =
      (ctx.gateResult.required_adjustments ?? []).some((a) => a.action === 'REDUCE_SCOPE_OR_ADD_EVIDENCE') === true;

    const req = this.toTripPlanRequest(ctx.tripPlanRequest, ctx.requestId);
    const minimalState: Partial<OrchestratorState> = {
      request_id: ctx.requestId,
      trip_plan_request: req,
      research_data: ctx.researchData,
      gate_result: ctx.gateResult as GateResult,
      itinerary: ctx.itinerary as any,
      alternatives: ctx.alternatives as OrchestratorState['alternatives'],
    };

    // A. Verifier 物理钩子（Repair-side fail-safe）
    // 某些编排路径中 VERIFY 可能被跳过，导致 real:{∅} 的“证据链断裂”。
    // 在 REPAIR 入口做一次最小地形硬约束投影：F-road/高地语义 + 2WD => 必然生成 L3 证据 + real repair trace（applied=false）。
    try {
      const msg = String((req as any)?.message ?? '').trim();
      const constraints = (req as any)?.constraints as Record<string, any> | undefined;
      const matches = matchAxioms({ message: msg, constraints });
      const terrain = matches.find((m) => m.axiom_id === 'TERRAIN_F_ROAD_UNFIT');
      const fatigue = matches.find((m) => m.axiom_id === 'FATIGUE_OVERLOAD');
      const eta = matches.find((m) => m.axiom_id === 'ETA_INFEASIBLE');
      const hasExisting = (dso.verification?.issues ?? []).some(
        (i) => parseL3ProofPrefix(String(i?.message ?? ''))?.cid === 'terrain.f_road_compatibility',
      );
      if (!hasExisting && terrain) {
        const now = new Date().toISOString();
        postRepairAdvisories.push({
          code: 'TERRAIN_F_ROAD_UNFIT',
          class: 'CONFLICT',
          message:
            `[L3-PROOF|${terrain.axiom.cid}|DESTINATION:${ctx.requestId}|cmp:GEQ|actual:2|limit:4|unit:WD|slack:-2|evidence:MODEL:intent_froad] ` +
            `意图要求 F-road/高地，但车辆为 2WD（冰岛高地普遍要求 4WD），物理上不可执行。`,
          source: 'ROUTE_FEASIBILITY',
          at: now,
          entityRef: { type: 'DESTINATION', id: String(req.destination ?? '') || ctx.requestId },
          suggestedActions: [
            { action: 'RELAX', detail: '升级车辆至 4WD 或取消 F-road/高地路段' },
            { action: 'ASK_USER', detail: '确认是否自担风险继续（可能仍无解）' },
          ],
          metadata: { confidence_impact: -0.25 },
        });
        repairTraces.push({
          tacticId: 'TerrainFRoadCompatibilityProjection',
          targetEntity: { type: 'DESTINATION', id: String(req.destination ?? '') || ctx.requestId },
          applied: false,
          metrics: {
            fatigue_weight: 1,
            base_limit: 4,
            effective_limit: 4,
            actual_cost: 2,
            unit: 'WD',
            utility_delta: AXIOM_REGISTRY.TERRAIN_F_ROAD_UNFIT.utility_anchor.actual_penalty,
          },
          reason: 'TERRAIN_F_ROAD_UNFIT',
          evidence: { refIds: ['intent_froad'] },
        });
        recoverySignal = 'NEED_USER_INTERVENTION';
        escalationPlan = {
          type: 'PHYSICAL_LIMIT_REACHED',
          reason: 'TERRAIN_F_ROAD_UNFIT',
          suggestedAction: 'ASK_USER',
          userClarificationSnippet:
            '【地形硬约束】2WD 与 F-road/高地意图不兼容（通常要求 4WD）。如坚持进入高地，请升级车辆或撤销 F-road 要求。',
          at: now,
          constraint: 'PHYSICAL_CONNECTIVITY',
        };
      }

      // FATIGUE_OVERLOAD: minimal real trace injection for drift alignment (when VERIFY is skipped or did not persist)
      const hasFatigueExisting = (dso.verification?.issues ?? []).some(
        (i) => parseL3ProofPrefix(String(i?.message ?? ''))?.cid === AXIOM_REGISTRY.FATIGUE_OVERLOAD.cid,
      );
      if (!hasFatigueExisting && fatigue) {
        const now = new Date().toISOString();
        postRepairAdvisories.push({
          code: 'FATIGUE_OVERLOAD',
          class: 'CONFLICT',
          message:
            `[L3-PROOF|${AXIOM_REGISTRY.FATIGUE_OVERLOAD.cid}|DAY:INTAKE|cmp:LEQ|actual:10|limit:8|unit:h|slack:-2|evidence:MODEL:intent_fatigue] ` +
            `行程强度/驾驶时长超过日常疲劳承载上限，可能导致疲劳过载。`,
          source: 'ROUTE_FEASIBILITY',
          at: now,
          entityRef: { type: 'DAY', id: 'INTAKE' },
          suggestedActions: [
            { action: 'RELAX', detail: '增加天数 / 降低单日驾驶时长 / 增加休息与缓冲' },
            { action: 'ASK_USER', detail: '确认是否坚持高强度节奏（不建议）' },
          ],
          metadata: { confidence_impact: -0.2 },
        });
        repairTraces.push({
          tacticId: 'FatigueOverloadProjection',
          targetEntity: { type: 'DAY', id: 'INTAKE' },
          applied: false,
          metrics: {
            fatigue_weight: 0,
            base_limit: 8,
            effective_limit: 8,
            actual_cost: 10,
            unit: 'h',
            utility_delta: AXIOM_REGISTRY.FATIGUE_OVERLOAD.utility_anchor.actual_penalty,
          },
          reason: AXIOM_REGISTRY.FATIGUE_OVERLOAD.real_label as any,
          evidence: { refIds: ['intent_fatigue'] },
        });
        recoverySignal = recoverySignal ?? 'NEED_USER_INTERVENTION';
        escalationPlan = escalationPlan ?? {
          type: 'PHYSICAL_LIMIT_REACHED',
          reason: AXIOM_REGISTRY.FATIGUE_OVERLOAD.real_label as any,
          suggestedAction: 'ASK_USER',
          userClarificationSnippet:
            '【疲劳硬约束】单日驾驶/行程强度超过疲劳承载上限。建议增加天数或降低单日驾驶时长。',
          at: now,
          constraint: 'PHYSICAL_CONNECTIVITY',
        };
      }

      // ETA_INFEASIBLE: minimal real trace injection for drift alignment
      const hasEtaExisting = (dso.verification?.issues ?? []).some(
        (i) => parseL3ProofPrefix(String(i?.message ?? ''))?.cid === AXIOM_REGISTRY.ETA_INFEASIBLE.cid,
      );
      if (!hasEtaExisting && eta) {
        const now = new Date().toISOString();
        postRepairAdvisories.push({
          code: 'ROUTE_INFEASIBLE',
          class: 'CONFLICT',
          message:
            `[L3-PROOF|${AXIOM_REGISTRY.ETA_INFEASIBLE.cid}|DAY:INTAKE|cmp:LEQ|actual:1|limit:0|unit:bool|slack:-1|evidence:MODEL:intent_eta] ` +
            `到达时间/时间窗约束不可满足（ETA infeasible）。`,
          source: 'ROUTE_FEASIBILITY',
          at: now,
          entityRef: { type: 'DAY', id: 'INTAKE' },
          suggestedActions: [
            { action: 'RELAX', detail: '放宽最晚到达时间 / 增加缓冲 / 减少当日行程点位' },
            { action: 'ASK_USER', detail: '确认是否坚持硬时间窗（可能无解）' },
          ],
          metadata: { confidence_impact: -0.2 },
        });
        repairTraces.push({
          tacticId: 'EtaInfeasibleProjection',
          targetEntity: { type: 'DAY', id: 'INTAKE' },
          applied: false,
          metrics: {
            fatigue_weight: 1,
            base_limit: 0,
            effective_limit: 0,
            actual_cost: 1,
            unit: 'bool',
            utility_delta: AXIOM_REGISTRY.ETA_INFEASIBLE.utility_anchor.actual_penalty,
          } as any,
          reason: AXIOM_REGISTRY.ETA_INFEASIBLE.real_label as any,
          evidence: { refIds: ['intent_eta'] },
        });
        recoverySignal = recoverySignal ?? 'NEED_USER_INTERVENTION';
        escalationPlan = escalationPlan ?? {
          type: 'PHYSICAL_LIMIT_REACHED',
          reason: AXIOM_REGISTRY.ETA_INFEASIBLE.real_label as any,
          suggestedAction: 'ASK_USER',
          userClarificationSnippet: '【时间窗硬约束】ETA/最晚到达时间窗不可满足。建议放宽时间窗或减少当日行程。',
          at: now,
          constraint: 'PHYSICAL_CONNECTIVITY',
        };
      }
    } catch {
      // best-effort only
    }

    // 0. 靶向治疗：优先读取 DSO.verification.issues（仅处理 CONFLICT）
    const report = dso.verification;
    const conflictIssues = (report?.issues ?? []).filter((i) => i.class === 'CONFLICT');
    if (itinerary && conflictIssues.length > 0) {
      for (const issue of conflictIssues) {
        const out = await this.tryDeterministicRepair(issue, dso, itinerary, ctx);
        if (out.repairTrace) repairTraces.push(out.repairTrace);
        if (out.producedFatal) {
          // 将 FATAL 以“异常”形式上抛给 Kernel/Orchestrator（下一轮 VERIFY 会写入 DSO.verification.hasFatal）
          throw new Error(`FATAL_REPAIR_GUARD: ${out.producedFatal.message}`);
        }
        if (out.escalationPlan) escalationPlan = out.escalationPlan;
        if (out.postRepairAdvisories?.length) postRepairAdvisories.push(...out.postRepairAdvisories);
        if (out.pendingMigrations?.length) pendingMigrations.push(...out.pendingMigrations);
        if (out.recoverySignal) recoverySignal = out.recoverySignal;
        if (out.itinerary) itinerary = out.itinerary;
        if (out.ok && out.itinerary) {
          repairApplied = true;

          const osc = this.detectTacticOscillation(out.itinerary, repairTraces);
          if (osc) {
            this.logger.warn(
              `[RepairExecutor] Tactic oscillation detected: ${osc.itemId} moved=${osc.moveCount}`,
            );
            return {
              itinerary: out.itinerary,
              repairApplied: true,
              repairTraces: repairTraces.length ? repairTraces : undefined,
              escalationPlan: {
                type: 'PHYSICAL_LIMIT_REACHED',
                reason: 'TACTIC_OSCILLATION',
                bottleneckNodeId: osc.itemId,
                suggestedAction: 'ASK_USER',
                userClarificationSnippet: osc.userClarificationSnippet,
                at: new Date().toISOString(),
                constraint: 'PHYSICAL_CONNECTIVITY',
              },
              recoverySignal: 'NEED_USER_INTERVENTION',
            };
          }

          continue;
        }
        if (out.escalationPlan) {
          continue;
        }
        // 确定性算子失败：降级到定向 LLM repair（只喂当前 issue + suggestedActions）
        const llm = await this.applyTargetedLlmRepair(issue, itinerary, ctx);
        if (llm.ok && llm.itinerary) {
          itinerary = llm.itinerary;
          repairApplied = true;
        }
      }
    }

    // 1. LocalInsight Agent 生成替代方案（保留：当 deterministic/targeted 未覆盖时）
    let alternatives = ctx.alternatives;
    // 当 Kernel 指示“低预算/补证据”时，跳过替代方案生成以节省链路与 token（repair.apply 只需执行 required_adjustments）。
    if (this.localInsightAgent && ctx.gateResult && !hasLowBudgetDirective) {
      try {
        const alt = await this.localInsightAgent.suggestAlternatives(
          req,
          ctx.gateResult as GateResult,
          minimalState as OrchestratorState,
        );
        if (alt.alternative_pois.length > 0 || alt.alternative_routes.length > 0) {
          repairApplied = true;
          alternatives = alt;
        }
      } catch (e: any) {
        this.logger.warn(`[RepairExecutor] LocalInsight Agent 失败: ${e?.message}`);
      }
    }

    // 2. repair.apply Skill 应用修复（保留 legacy：当 gateResult.required_adjustments 显式存在时）
    if (this.skillsRegistry && itinerary && ctx.gateResult.required_adjustments?.length > 0) {
      try {
        const skill = this.skillsRegistry.getSkill('repair.apply');
        if (skill) {
          const result = await skill.execute({
            itinerary: itinerary as any,
            adjustments: ctx.gateResult.required_adjustments,
            alternatives: alternatives || { alternative_pois: [], alternative_routes: [] },
          });
          if (result?.repaired && result.itinerary) {
            repairApplied = true;
            itinerary = {
              request_id: result.itinerary.request_id,
              days: result.itinerary.days,
              metadata: result.itinerary.metadata,
            };
          }
        }
      } catch (e: any) {
        this.logger.warn(`[RepairExecutor] repair.apply 失败: ${e?.message}`);
      }
    }

    const roundUtility = repairTraces.reduce((s, t) => s + (t.metrics?.utility_delta ?? 0), 0);
    const thRaw = process.env.DECISION_REPAIR_UTILITY_DELTA_THRESHOLD;
    const defaultTh = -45;
    const threshold =
      thRaw != null && String(thRaw).trim() !== '' && Number.isFinite(Number(thRaw)) ? Number(thRaw) : defaultTh;
    if (!recoverySignal && !escalationPlan && repairApplied && roundUtility < threshold && repairTraces.length > 0) {
      recoverySignal = 'NEED_USER_INTERVENTION';
      escalationPlan = {
        type: 'PHYSICAL_LIMIT_REACHED',
        reason: 'UTILITY_COMPENSATION_THRESHOLD',
        suggestedAction: 'ASK_USER',
        userClarificationSnippet:
          `【效用补偿】本轮自动修复累计 utility_delta≈${roundUtility.toFixed(1)}（阈值=${threshold}）。` +
          `继续静默压缩/迁移可能显著拉低体验分；请您进行更高级别放宽（减 POI / 加天 / 降强度 / 调交通）以避免“修到不像旅行”。`,
        at: new Date().toISOString(),
      };
    }

    return {
      itinerary,
      repairApplied,
      repairTraces: repairTraces.length ? repairTraces : undefined,
      escalationPlan,
      postRepairAdvisories: postRepairAdvisories.length ? postRepairAdvisories : undefined,
      pendingMigrations: pendingMigrations.length ? pendingMigrations : undefined,
      recoverySignal,
    };
  }

  private async tryDeterministicRepair(
    issue: VerificationIssue,
    dso: DecisionState,
    itinerary: ItineraryLike,
    ctx: PhaseExecutorContext,
  ): Promise<{
    ok: boolean;
    itinerary?: ItineraryLike;
    repairTrace?: RepairTrace;
    producedFatal?: VerificationIssue;
    escalationPlan?: RepairEscalationPlan;
    postRepairAdvisories?: VerificationIssue[];
    pendingMigrations?: PendingMigrationRequest[];
    recoverySignal?: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION';
  }> {
    // L3-first tactic router: prefer proof-carrying repairs when possible.
    const proof = parseL3ProofPrefix(issue.message);
    if (proof?.cid === 'terrain.f_road_compatibility' && typeof proof.slack === 'number' && proof.slack < 0) {
      const repairTrace: RepairTrace = {
        tacticId: 'TerrainFRoadCompatibilityProjection',
        targetEntity: issue.entityRef ?? { type: 'DESTINATION', id: ctx.requestId },
        applied: false,
        metrics: {
          fatigue_weight: 1,
          base_limit: Number.isFinite(proof.limit) ? (proof.limit as number) : 4,
          effective_limit: Number.isFinite(proof.limit) ? (proof.limit as number) : 4,
          actual_cost: Number.isFinite(proof.actual) ? (proof.actual as number) : 2,
          unit: proof.unit ?? 'WD',
          utility_delta: -12,
        },
        reason: 'TERRAIN_F_ROAD_UNFIT',
        evidence: proof.evidence?.refIds?.length ? { refIds: proof.evidence.refIds } : { refIds: ['intent_froad'] },
      };
      return {
        ok: false,
        repairTrace,
        escalationPlan: {
          type: 'PHYSICAL_LIMIT_REACHED',
          reason: 'TERRAIN_F_ROAD_UNFIT',
          suggestedAction: 'ASK_USER',
          userClarificationSnippet:
            '【地形硬约束】2WD 与 F-road/高地意图不兼容（通常要求 4WD）。如坚持进入高地，请升级车辆或撤销 F-road 要求。',
          at: new Date().toISOString(),
          constraint: 'PHYSICAL_CONNECTIVITY',
        },
        recoverySignal: 'NEED_USER_INTERVENTION',
      };
    }
    if (proof?.cid === 'time_space.min_transfer_buffer' && typeof proof.slack === 'number' && proof.slack < 0) {
      const out = this.timeSpaceMinTransferBufferTactic(issue, itinerary, proof.slack);
      if (out.ok && out.itinerary && typeof out.debtMin === 'number') {
        const debt = out.debtMin;
        const util = -0.85 * debt;
        const repairTrace: RepairTrace = {
          tacticId: 'TimeShrinkTactic',
          targetEntity: issue.entityRef ?? { type: 'SEGMENT' },
          applied: true,
          reason: 'SUCCESS_APPLIED',
          metrics: {
            fatigue_weight: 1,
            base_limit: 0,
            effective_limit: 0,
            actual_cost: debt,
            unit: 'min',
            utility_delta: util,
          },
          evidence: { refIds: [`UTILITY:TIME_SHRINK_DEBT_MIN=${debt}`] },
        };
        return { ok: true, itinerary: out.itinerary, repairTrace };
      }
    }
    if (proof?.cid === 'time_space.max_driving_hours' && typeof proof.slack === 'number' && proof.slack < 0) {
      const out = this.timeSpaceMaxDrivingHoursTactic(issue, dso, itinerary, proof.slack);
      if (out.ok && out.itinerary) {
        const util = typeof out.utility_delta === 'number' ? out.utility_delta : -12;
        const repairTrace: RepairTrace = {
          tacticId: out.tacticId ?? 'MigrateToNextDayTactic',
          targetEntity: issue.entityRef ?? { type: 'DAY' },
          applied: true,
          reason: 'SUCCESS_APPLIED',
          metrics: {
            fatigue_weight: 1,
            base_limit: 0,
            effective_limit: 0,
            actual_cost: 1,
            unit: 'op',
            utility_delta: util,
          },
          evidence: { refIds: [`UTILITY:${String(out.tacticId ?? 'MAX_DRIVE_REPAIR')}`] },
        };
        return { ok: true, itinerary: out.itinerary, repairTrace };
      }
    }
    if (proof?.cid === 'time_space.eta_feasibility' && typeof proof.slack === 'number' && proof.slack < 0) {
      const out = this.timeSpaceEtaFeasibilityShiftTactic(issue, itinerary, proof.slack);
      if (out.ok && out.itinerary && typeof out.debtMin === 'number') {
        const debt = out.debtMin;
        const util = -0.45 * debt;
        const repairTrace: RepairTrace = {
          tacticId: 'ShiftTactic',
          targetEntity: issue.entityRef ?? { type: 'SEGMENT' },
          applied: true,
          reason: 'SUCCESS_APPLIED',
          metrics: {
            fatigue_weight: 1,
            base_limit: 0,
            effective_limit: 0,
            actual_cost: debt,
            unit: 'min',
            utility_delta: util,
          },
          evidence: { refIds: [`UTILITY:ETA_SHIFT_DEBT_MIN=${debt}`] },
        };
        return { ok: true, itinerary: out.itinerary, repairTrace };
      }
    }
    if (proof?.cid === 'terrain.max_slope_pct' && typeof proof.slack === 'number' && proof.slack < 0) {
      const out = await this.terrainRerouteTactic(issue, dso, ctx, proof);
      if (out.ok && out.itinerary) return { ...out, repairTrace: out.repairTrace };
      if (out.repairTrace) return { ok: false, repairTrace: out.repairTrace };
    }

    switch (issue.code as VerificationIssueCode) {
      case 'POI_CLOSED':
        return this.poiClosedReplacementOperator(issue, dso, itinerary, ctx);
      case 'TIME_WINDOW_OVERLAP':
      case 'TIME_WINDOW_BREACH':
        return this.timeWindowSwapShiftOperator(issue, itinerary);
      case 'ROUTE_INFEASIBLE':
      case 'SUNSET_BREACH':
        return this.routeOptimizerOperatorL2(issue, dso, itinerary, ctx);
      case 'FATIGUE_OVERLOAD':
      case 'FATIGUE_HIGH':
        return this.relaxationOperator(issue, dso, itinerary, { ctx, relaxationCause: 'FATIGUE' });
      default:
        return { ok: false };
    }
  }

  /**
   * Formal Tactic (v0): TIME_SPACE_MIN_TRANSFER_BUFFER
   *
   * entityRef.id convention: "<dayDate>|<fromItemId>-><toItemId>"
   * Repair strategy: shrink duration of `fromItem` by debt minutes (best-effort).
   */
  private timeSpaceMinTransferBufferTactic(
    issue: VerificationIssue,
    itinerary: ItineraryLike,
    slackMin: number,
  ): { ok: boolean; itinerary?: ItineraryLike; debtMin?: number } {
    const ref = issue.entityRef;
    if (!ref || ref.type !== 'SEGMENT' || !ref.id) return { ok: false };
    const id = String(ref.id);
    const [dayDateRaw, edge] = id.split('|');
    const dayDate = String(dayDateRaw ?? '').trim();
    const [fromId, toId] = String(edge ?? '').split('->').map((s) => s.trim());
    if (!dayDate || !fromId || !toId) return { ok: false };
    const debt = Math.max(1, Math.round(Math.abs(slackMin)));

    const next = this.cloneItinerary(itinerary);
    const dayIdx = (next.days as any[]).findIndex((d) => String(d?.date ?? '') === dayDate);
    if (dayIdx < 0) return { ok: false };
    const day: any = (next.days as any[])[dayIdx];
    const items: any[] = Array.isArray(day?.items) ? day.items : [];
    const fromIdx = items.findIndex((it) => String(it?.id ?? '') === fromId);
    const toIdx = items.findIndex((it) => String(it?.id ?? '') === toId);
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) return { ok: false };

    const from = items[fromIdx] ?? {};
    const currDur = typeof from?.metadata?.duration_minutes === 'number' ? from.metadata.duration_minutes : undefined;
    if (!Number.isFinite(currDur)) return { ok: false };
    const newDur = Math.max(0, Math.round(currDur) - debt);
    if (newDur === Math.round(currDur)) return { ok: false };

    items[fromIdx] = {
      ...from,
      metadata: {
        ...(from.metadata ?? {}),
        duration_minutes: newDur,
        repair_tactic: 'TimeShrinkTactic',
        repair_tactic_debt_min: debt,
        repair_tactic_from: String(fromId),
        repair_tactic_to: String(toId),
        ...this.appendTacticSignature(from.metadata, {
          constraintId: 'time_space.min_transfer_buffer',
          tacticId: 'TimeShrinkTactic',
          moveDelta: 1,
        }),
      },
      notes: `${String(from.notes ?? '')} [Tactic] shortened by ${debt}min for transfer buffer`.trim(),
    };
    day.items = items;
    const logs = (next.metadata?.explain_logs ?? []) as string[];
    next.metadata = {
      ...(next.metadata ?? {}),
      explain_logs: [
        `[Tactic] TIME_SPACE_MIN_TRANSFER_BUFFER: shrink ${fromId} duration by ${debt}min (${dayDate})`,
        ...logs,
      ],
    };
    return { ok: true, itinerary: next, debtMin: debt };
  }

  /**
   * Formal Tactic (v0): TIME_SPACE_MAX_DRIVING_HOURS
   *
   * Strategy:
   * - Prefer migration (move last non-anchor POI-like item to next day) to retain utility.
   * - Fallback: remove lowest-utility non-anchor item on that day.
   *
   * NOTE: This is a single-step operator. Kernel VERIFY/REPAIR loop will re-run until slack >= 0.
   */
  private timeSpaceMaxDrivingHoursTactic(
    issue: VerificationIssue,
    dso: DecisionState,
    itinerary: ItineraryLike,
    _slackHours: number,
  ): { ok: boolean; itinerary?: ItineraryLike; utility_delta?: number; tacticId?: string } {
    const ref = issue.entityRef;
    if (!ref || ref.type !== 'DAY' || !ref.id) return { ok: false };
    const dayDate = String(ref.id).trim();
    if (!dayDate) return { ok: false };

    const next = this.cloneItinerary(itinerary);
    const days = next.days as any[];
    const dayIdx = days.findIndex((d) => String(d?.date ?? '') === dayDate);
    if (dayIdx < 0) return { ok: false };

    const anchors = new Set<string>((dso.poiPlanning?.poiPlan?.requiredAnchorPoiIds ?? []).map(String));
    const day = days[dayIdx];
    const items: any[] = Array.isArray(day?.items) ? [...day.items] : [];
    if (items.length < 2) return { ok: false };

    const isAnchorItem = (it: any): boolean => {
      const pid = String(it?.location_ref?.place_id ?? it?.poi_id ?? it?.id ?? it?.place_id ?? '');
      return !!(pid && anchors.has(pid));
    };

    const nonAnchorIdxs = items
      .map((it, idx) => ({ it, idx }))
      .filter(({ it }) => !isAnchorItem(it))
      .map(({ idx }) => idx);
    if (nonAnchorIdxs.length === 0) return { ok: false };

    // Prefer migration of the last non-anchor POI-like item to next day if it exists.
    const nextDay = days[dayIdx + 1];
    if (nextDay && Array.isArray(nextDay.items)) {
      const lastIdx = [...nonAnchorIdxs].reverse().find((idx) => {
        const it = items[idx];
        return it?.type === 'POI' || it?.location_ref?.place_id || it?.poi_id;
      });
      if (lastIdx != null && lastIdx >= 0) {
        const moved = items.splice(lastIdx, 1)[0];
        if (moved) {
          moved.metadata = {
            ...(moved.metadata ?? {}),
            ...this.appendTacticSignature(moved.metadata, {
              constraintId: 'time_space.max_driving_hours',
              tacticId: 'MigrateToNextDayTactic',
              moveDelta: 1,
            }),
          };
        }
        day.items = items;
        nextDay.items = [...nextDay.items, moved];
        const logs = (next.metadata?.explain_logs ?? []) as string[];
        next.metadata = {
          ...(next.metadata ?? {}),
          explain_logs: [
            `[Tactic] TIME_SPACE_MAX_DRIVING_HOURS: migrate item ${String(moved?.id ?? '')} from ${dayDate} → ${String(nextDay.date ?? '')}`,
            ...logs,
          ],
        };
        return { ok: true, itinerary: next, utility_delta: -14, tacticId: 'MigrateToNextDayTactic' };
      }
    }

    // Fallback: remove the lowest-utility non-anchor item on that day.
    const scored = nonAnchorIdxs
      .map((idx) => {
        const it = items[idx];
        const base =
          it?.type === 'POI'
            ? 100
            : it?.type === 'MEAL'
              ? 70
              : it?.type === 'REST'
                ? 40
                : 55;
        const evidenceBoost = Array.isArray(it?.evidence_refs) ? Math.min(20, it.evidence_refs.length) : 0;
        const durationPenalty = typeof it?.metadata?.duration_minutes === 'number' ? Math.min(30, it.metadata.duration_minutes / 10) : 0;
        const score = base + evidenceBoost - durationPenalty;
        return { idx, score, it };
      })
      .sort((a, b) => a.score - b.score);
    const drop = scored[0];
    if (!drop) return { ok: false };
    const removed = items.splice(drop.idx, 1)[0];
    day.items = items;
    const logs = (next.metadata?.explain_logs ?? []) as string[];
    next.metadata = {
      ...(next.metadata ?? {}),
      explain_logs: [
        `[Tactic] TIME_SPACE_MAX_DRIVING_HOURS: drop item ${String(removed?.id ?? '')} on ${dayDate}`,
        ...logs,
      ],
    };
    return { ok: true, itinerary: next, utility_delta: -32, tacticId: 'DropItemTactic' };
  }

  /**
   * Formal Tactic (v0): TIME_SPACE_ETA_FEASIBILITY
   *
   * Strategy: segment-level shift (push later items forward by debt minutes).
   * entityRef.id convention: "<dayDate>|<fromItemId>-><toItemId>"
   */
  private timeSpaceEtaFeasibilityShiftTactic(
    issue: VerificationIssue,
    itinerary: ItineraryLike,
    slackMin: number,
  ): { ok: boolean; itinerary?: ItineraryLike; debtMin?: number } {
    const ref = issue.entityRef;
    if (!ref || ref.type !== 'SEGMENT' || !ref.id) return { ok: false };
    const id = String(ref.id);
    const [dayDateRaw, edge] = id.split('|');
    const dayDate = String(dayDateRaw ?? '').trim();
    const [fromId, toId] = String(edge ?? '').split('->').map((s) => s.trim());
    if (!dayDate || !fromId || !toId) return { ok: false };
    const debt = Math.max(1, Math.round(Math.abs(slackMin)));

    const next = this.cloneItinerary(itinerary);
    const dayIdx = (next.days as any[]).findIndex((d) => String(d?.date ?? '') === dayDate);
    if (dayIdx < 0) return { ok: false };
    const day: any = (next.days as any[])[dayIdx];
    const items: any[] = Array.isArray(day?.items) ? [...day.items] : [];
    const toIdx = items.findIndex((it) => String(it?.id ?? '') === toId);
    if (toIdx < 0) return { ok: false };

    let shifted = 0;
    for (let i = toIdx; i < items.length; i++) {
      const it = items[i];
      const w = parseItemWindow(dayDate, it);
      if (w.start && Number.isFinite(w.start.getTime())) {
        it.start_window = addMinutes(w.start, debt).toISOString();
        shifted++;
      }
      if (w.end && Number.isFinite(w.end.getTime())) {
        it.end_window = addMinutes(w.end, debt).toISOString();
        shifted++;
      }
      items[i] = it;
    }
    if (shifted === 0) return { ok: false };

    // Mark the primary shifted node as touched (avoid tagging every node to reduce noise).
    const primary = items[toIdx];
    if (primary) {
      primary.metadata = {
        ...(primary.metadata ?? {}),
        ...this.appendTacticSignature(primary.metadata, {
          constraintId: 'time_space.eta_feasibility',
          tacticId: 'ShiftTactic',
          moveDelta: 1,
        }),
      };
      items[toIdx] = primary;
    }
    day.items = items;

    const logs = (next.metadata?.explain_logs ?? []) as string[];
    next.metadata = {
      ...(next.metadata ?? {}),
      explain_logs: [
        `[Tactic] TIME_SPACE_ETA_FEASIBILITY: shift items >=${toId} by ${debt}min (${dayDate})`,
        ...logs,
      ],
    };
    return { ok: true, itinerary: next, debtMin: debt };
  }

  private appendTacticSignature(
    priorMeta: any,
    input: { constraintId: string; tacticId: string; moveDelta: number },
  ): { repair_tactic_signatures: any[]; repair_move_count: number } {
    const prev = priorMeta && typeof priorMeta === 'object' ? priorMeta : {};
    const prevArr = Array.isArray(prev.repair_tactic_signatures) ? prev.repair_tactic_signatures : [];
    const nextArr = [
      ...prevArr,
      {
        at: new Date().toISOString(),
        constraintId: input.constraintId,
        tacticId: input.tacticId,
      },
    ].slice(-10); // cap
    const prevCount = typeof prev.repair_move_count === 'number' ? prev.repair_move_count : 0;
    const repair_move_count = prevCount + Math.max(0, Math.round(input.moveDelta));
    return { repair_tactic_signatures: nextArr, repair_move_count };
  }

  private detectTacticOscillation(
    itin: ItineraryLike,
    repairTraces?: RepairTrace[],
  ): { itemId: string; moveCount: number; userClarificationSnippet: string } | undefined {
    const days = (itin.days as any[]) ?? [];
    for (const d of days) {
      const items: any[] = Array.isArray(d?.items) ? d.items : [];
      for (const it of items) {
        const mc = typeof it?.metadata?.repair_move_count === 'number' ? it.metadata.repair_move_count : 0;
        if (mc >= RepairExecutorService.OSCILLATION_MOVE_THRESHOLD) {
          const itemId = String(it?.id ?? it?.location_ref?.place_id ?? it?.poi_id ?? 'unknown');
          const signatures = Array.isArray(it?.metadata?.repair_tactic_signatures)
            ? (it.metadata.repair_tactic_signatures as any[])
            : [];
          const userClarificationSnippet = formatRepairDeadlockAudit({
            moveCount: mc,
            itemId,
            signatures,
            repairTraces,
            maxSteps: 5,
          });
          return { itemId, moveCount: mc, userClarificationSnippet };
        }
      }
    }
    return undefined;
  }

  /**
   * TerrainRerouteTactic (v0 skeleton)
   * - Calls optional routing engine to request an alternative path avoiding steep slopes.
   * - Applies accept/reject based on evaluateAltPath; v0 does not mutate itinerary yet without a concrete patch.
   * - Records path_fingerprint into the signatures to enable cycle-detection.
   */
  private async terrainRerouteTactic(
    issue: VerificationIssue,
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    proof: { slack?: number; limit?: number; cid: string },
  ): Promise<{ ok: boolean; itinerary?: ItineraryLike; repairTrace?: RepairTrace }> {
    if (!this.terrainRerouteEngine) return { ok: false };
    const avoidSlopePctGE = typeof proof.limit === 'number' && Number.isFinite(proof.limit) ? proof.limit : undefined;
    const entityRefId = issue.entityRef?.id;
    const alt = await this.terrainRerouteEngine.findAlternativePath({
      requestId: ctx.requestId,
      entityRefId: entityRefId ? String(entityRefId) : undefined,
      avoidSlopePctGE,
    });
    if (!alt) return { ok: false };

    const fatigue01 = this.deriveNormalizedFatigueScore01(dso);
    const fatigueWeight = this.deriveFatigueWeight(fatigue01);
    const policy = this.deriveTerrainAltPathPolicy(ctx, { fatigue01, fatigueWeight });
    const decision = evaluateAltPath(alt, policy);
    const baseLimit = 45;
    const effectiveLimit = policy.max_extra_drive_min_soft;
    const actualCost = Math.max(0, Math.round(Number(alt.delta_drive_min) || 0));
    const segId = String(alt.patch?.segment_id ?? issue.entityRef?.id ?? entityRefId ?? '');
    // Hard cycle prevention: if this segment has already tried the same path_fingerprint in this repair lineage, reject.
    if (ctx.itinerary && segId && alt.path_fingerprint) {
      const curr = this.findItineraryItemById(ctx.itinerary, segId);
      const seen = Array.isArray(curr?.metadata?.reroute_path_fingerprints)
        ? (curr.metadata.reroute_path_fingerprints as any[]).map(String)
        : [];
      if (seen.includes(String(alt.path_fingerprint))) {
        const repairTrace: RepairTrace = {
          tacticId: 'TerrainRerouteTactic',
          targetEntity: { type: 'SEGMENT', id: segId },
          applied: false,
          metrics: {
            fatigue_score01: this.deriveNormalizedFatigueScore01(dso),
            fatigue_weight: this.deriveFatigueWeight(this.deriveNormalizedFatigueScore01(dso)),
            base_limit: 45,
            effective_limit: 0,
            actual_cost: Math.max(0, Math.round(Number(alt.delta_drive_min) || 0)),
            unit: 'min',
          },
          reason: 'OSCILLATION_PREVENTION',
          evidence: { path_fingerprint: String(alt.path_fingerprint), segment_id: segId },
        };
        return { ok: false, repairTrace };
      }
    }
    const reasonWhenRejected: RepairReason =
      effectiveLimit <= 0 ? 'FATIGUE_EXHAUSTION' : actualCost > policy.max_extra_drive_min_hard ? 'COST_EXCEEDS_HARD_LIMIT' : 'FATIGUE_SUPPRESSION';
    const repairTrace: RepairTrace = {
      tacticId: 'TerrainRerouteTactic',
      targetEntity: { type: 'SEGMENT', ...(segId ? { id: segId } : {}) },
      applied: false,
      metrics: {
        fatigue_score01: fatigue01,
        fatigue_weight: fatigueWeight,
        base_limit: baseLimit,
        effective_limit: effectiveLimit,
        actual_cost: actualCost,
        unit: 'min',
      },
      reason: decision.accept ? 'SUCCESS_APPLIED' : reasonWhenRejected,
      evidence: { path_fingerprint: alt.path_fingerprint, ...(segId ? { segment_id: segId } : {}) },
    };
    if (!decision.accept) {
      return { ok: false, repairTrace };
    }

    const next = ctx.itinerary ? this.cloneItinerary(ctx.itinerary) : undefined;
    if (!next) return { ok: false, repairTrace };
    const didApply = alt.patch ? this.applySegmentRoutePatch(next, alt.patch) : false;
    repairTrace.applied = didApply;
    repairTrace.reason = didApply ? 'SUCCESS_APPLIED' : 'PATCH_MISSING';
    if (didApply) {
      repairTrace.metrics.utility_delta = -Math.min(18, Math.max(1, Math.round(Number(alt.delta_drive_min) * 0.15)));
    }
    const logs = (next.metadata?.explain_logs ?? []) as string[];
    next.metadata = {
      ...(next.metadata ?? {}),
      explain_logs: [
        `[Tactic] TERRAIN_REROUTE: accept altPath fp=${alt.path_fingerprint} Δdrive=${Math.round(alt.delta_drive_min)}min` +
          (didApply ? ' patch=APPLIED' : ' patch=MISSING') +
          ` (w_fatigue=${fatigueWeight.toFixed(3)} eff_soft=${policy.max_extra_drive_min_soft}min eff_hard=${policy.max_extra_drive_min_hard}min reason=${decision.reason})`,
        ...logs,
      ],
    };
    // Mark the patched segment (or fall back to the first item) to carry fingerprint for oscillation detection.
    const segmentId = String(alt.patch?.segment_id ?? issue.entityRef?.id ?? '');
    const touched = segmentId ? this.findItineraryItemById(next, segmentId) : undefined;
    const fallbackFirst = touched ?? this.findFirstItineraryItem(next);
    if (fallbackFirst) {
      // Persist fingerprint history on the segment itself (minimal, bounded).
      if (segId && alt.path_fingerprint) {
        const prev = Array.isArray((fallbackFirst.metadata as any)?.reroute_path_fingerprints)
          ? ((fallbackFirst.metadata as any).reroute_path_fingerprints as any[])
          : [];
        const nextFps = [...prev.map(String), String(alt.path_fingerprint)];
        (fallbackFirst.metadata as any).reroute_path_fingerprints = Array.from(new Set(nextFps)).slice(-8);
      }
      fallbackFirst.metadata = {
        ...(fallbackFirst.metadata ?? {}),
        ...this.appendTacticSignature(fallbackFirst.metadata, {
          constraintId: 'terrain.max_slope_pct',
          tacticId: `RerouteTactic:${String(alt.path_fingerprint)}|w=${fatigueWeight.toFixed(3)}|effSoft=${policy.max_extra_drive_min_soft}|effHard=${policy.max_extra_drive_min_hard}`,
          moveDelta: 1,
        }),
      };
    }
    return { ok: true, itinerary: next, repairTrace };
  }

  private deriveTerrainAltPathPolicy(
    ctx: PhaseExecutorContext,
    fatigue?: { fatigue01: number; fatigueWeight: number },
  ): { max_extra_drive_min_soft: number; max_extra_drive_min_hard: number } {
    // Default v0 policy.
    // Note: terrain reroute is a "HARD-fix hammer"; we allow a bit more detour by default,
    // and let downstream time_space tactics absorb the cascade in the VERIFY↔REPAIR loop.
    let soft = 45;
    let hard = 120;

    // If fatigue is already a top-level concern, be more conservative about extra driving.
    const v = ctx.gateResult?.violations ?? [];
    const hasHardFatigue = v.some((x) => String(x?.type ?? '').toUpperCase() === 'FATIGUE' && x?.severity === 'HARD');
    const hasSoftFatigue = v.some((x) => String(x?.type ?? '').toUpperCase() === 'FATIGUE' && x?.severity === 'SOFT');
    if (hasHardFatigue) {
      soft = 15;
      hard = 60;
    } else if (hasSoftFatigue) {
      soft = 20;
      hard = 90;
    }

    // Fitness hints: low fitness -> stricter; high fitness -> slightly more tolerant.
    const fitness = String(ctx.tripPlanRequest?.party?.fitness_level ?? ctx.tripPlanRequest?.party_profile?.fitness ?? '').toLowerCase();
    if (fitness === 'low') {
      soft = Math.min(soft, 20);
      hard = Math.min(hard, 90);
    } else if (fitness === 'high') {
      soft = Math.max(soft, 35);
      hard = Math.max(hard, 120);
    }

    // Continuous physiological scaling (v1): effective_limit = base_limit * w(f).
    const wf = fatigue?.fatigueWeight;
    if (typeof wf === 'number' && Number.isFinite(wf)) {
      const w = Math.max(0, Math.min(1, wf));
      soft = Math.max(0, Math.round(soft * w));
      hard = Math.max(soft, Math.round(hard * w));
    }

    return { max_extra_drive_min_soft: soft, max_extra_drive_min_hard: hard };
  }

  private deriveNormalizedFatigueScore01(dso: DecisionState): number {
    // Canonical signal: DSO.tripState.fatigue is a scalar; treat as 0..100 if present.
    const raw = (dso as any)?.tripState?.fatigue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return 0;
    // If some pipelines store 0..1, normalize up.
    const v = raw <= 1 ? raw : raw / 100;
    return Math.max(0, Math.min(1, v));
  }

  /**
   * Fatigue weight w(f) (continuous, v1):
   * - f in [0,1], higher means more fatigue.
   * - w in (0,1], higher means more tolerance for extra driving.
   * Linear first: w = 1 - f.
   * (Sigmoid can be swapped in later without changing call sites.)
   */
  private deriveFatigueWeight(fatigue01: number): number {
    const f = Math.max(0, Math.min(1, fatigue01));
    if (f < 0.3) return 1;
    if (f >= 0.8) return 0;
    return Math.max(0, Math.min(1, (0.8 - f) / 0.5));
  }

  private findFirstItineraryItem(itin: ItineraryLike): any | undefined {
    const firstDay: any = (itin.days as any[])?.[0];
    const items: any[] = Array.isArray(firstDay?.items) ? firstDay.items : [];
    return items[0];
  }

  private findItineraryItemById(itin: ItineraryLike, id: string): any | undefined {
    for (const d of (itin.days as any[]) ?? []) {
      const items: any[] = Array.isArray(d?.items) ? d.items : [];
      for (const it of items) {
        if (String(it?.id ?? '') === String(id)) return it;
      }
    }
    return undefined;
  }

  private applySegmentRoutePatch(
    itin: ItineraryLike,
    patch: { segment_id: string; encoded_polyline?: string; distance_meters?: number; eta_minutes?: number },
  ): boolean {
    const segId = String(patch.segment_id ?? '');
    if (!segId) return false;
    const hit = this.findItineraryItemById(itin, segId);
    if (!hit) return false;
    const meta = { ...(hit.metadata ?? {}) } as Record<string, unknown>;
    if (typeof patch.encoded_polyline === 'string' && patch.encoded_polyline.trim()) {
      meta.route_encoded_polyline = patch.encoded_polyline.trim();
    }
    if (typeof patch.distance_meters === 'number' && Number.isFinite(patch.distance_meters) && patch.distance_meters >= 0) {
      meta.distance_meters = Math.round(patch.distance_meters);
    }
    if (typeof patch.eta_minutes === 'number' && Number.isFinite(patch.eta_minutes) && patch.eta_minutes >= 0) {
      meta.route_eta_minutes = Math.round(patch.eta_minutes);
    }
    meta.route_patch_applied_at = new Date().toISOString();
    meta.route_patch_kind = 'TERRAIN_REROUTE_SEGMENT_ATOMIC_V0';
    hit.metadata = meta;
    return true;
  }

  /**
   * 定向 LLM 修复：仅把当前 issue + suggestedActions 作为 adjustments 喂给 repair.apply
   */
  private async applyTargetedLlmRepair(
    issue: VerificationIssue,
    itinerary: ItineraryLike,
    ctx: PhaseExecutorContext,
  ): Promise<{ ok: boolean; itinerary?: ItineraryLike }> {
    if (!this.skillsRegistry) return { ok: false };
    if (!ctx.gateResult) return { ok: false };
    const skill = this.skillsRegistry.getSkill('repair.apply');
    if (!skill) return { ok: false };

    const adjustments =
      issue.suggestedActions?.length
        ? issue.suggestedActions.map((a) => ({
            action: a.action,
            why: `${issue.code}: ${issue.message}${a.detail ? ` (${a.detail})` : ''}`,
          }))
        : [{ action: 'ADJUST', why: `${issue.code}: ${issue.message}` }];

    try {
      const result = await skill.execute({
        itinerary: itinerary as any,
        adjustments,
        alternatives: ctx.alternatives || { alternative_pois: [], alternative_routes: [] },
      });
      if (result?.repaired && result.itinerary) {
        return {
          ok: true,
          itinerary: {
            request_id: result.itinerary.request_id,
            days: result.itinerary.days,
            metadata: result.itinerary.metadata,
          },
        };
      }
      return { ok: false };
    } catch (e: any) {
      this.logger.warn(`[RepairExecutor] targeted repair.apply 失败: ${e?.message}`);
      return { ok: false };
    }
  }

  /**
   * POI_CLOSED → Replacement Operator（最小实现）
   * - 优先用 ctx.alternatives.alternative_pois
   * - 无则尝试 poi.search 同目的地 query 找一个不同 POI
   * - 用 solveDayTimeline 预估到达时刻 + isOpenAt(periods) 过滤；弱证据时附加 CONFIDENCE_DEGRADED
   */
  private async poiClosedReplacementOperator(
    _issue: VerificationIssue,
    _dso: DecisionState,
    itinerary: ItineraryLike,
    ctx: PhaseExecutorContext,
  ): Promise<{ ok: boolean; itinerary?: ItineraryLike; postRepairAdvisories?: VerificationIssue[] }> {
    const radiusMeters = Number(process.env.DECISION_REPAIR_REPLACEMENT_RADIUS_M ?? 3000);
    const dest =
      typeof ctx.tripPlanRequest?.destination === 'string'
        ? ctx.tripPlanRequest?.destination
        : undefined;
    const altPois = (ctx.alternatives?.alternative_pois ?? []) as any[];

    const { closedProfile, closedCategory } = this.inferClosedItemProfile(_issue, itinerary, ctx);
    const closedLoc = closedProfile?.location;

    const altCandidates = altPois
      .map((p) => ({
        poi_id: String(p?.poi_id ?? p?.id ?? p?.place_id ?? ''),
        coordinates: p?.coordinates ?? p?.geo ?? (p?.lat && p?.lng ? { lat: p.lat, lng: p.lng } : undefined),
        category: p?.category,
        raw: p,
      }))
      .filter((c) => c.poi_id && c.coordinates?.lat != null && c.coordinates?.lng != null);

    const closedPoiId = String(closedProfile?.poiId ?? '').trim();
    const searched = await this.trySearchPoiReplacement(
      dest,
      closedLoc,
      _dso,
      ctx,
      itinerary,
      closedPoiId,
      closedCategory,
    );
    const searchCandidates = (searched.pois ?? []).map((p) => ({
      poi_id: p.poi_id,
      coordinates: p.coordinates,
      category: p.category,
      raw: p,
    }));

    const pool = [...altCandidates, ...searchCandidates];
    const filtered = pool
      .filter((c) => !closedCategory || !c.category || String(c.category) === String(closedCategory))
      .filter((c) => {
        if (!closedLoc || !c.coordinates) return true;
        const d = haversineMeters({ lat: closedLoc.lat, lng: closedLoc.lng }, c.coordinates);
        return Number.isFinite(d) ? d <= radiusMeters : true;
      });

    let slot: { dayIdx: number; idx: number } | undefined;
    for (let di = 0; di < (itinerary.days?.length ?? 0); di++) {
      const day = (itinerary.days as any[])[di];
      const items: any[] = Array.isArray(day?.items) ? day.items : [];
      const idx = items.findIndex((it) => it && (it.poi_id || it?.location_ref?.place_id || it.id || it.place_id));
      if (idx >= 0) {
        slot = { dayIdx: di, idx };
        break;
      }
    }
    if (!slot) return { ok: false };

    const applyCandidate = (base: ItineraryLike, raw: any): ItineraryLike => {
      const next: ItineraryLike = { ...base, days: base.days.map((d) => ({ ...d, items: [...((d as any).items ?? [])] })) };
      const day = (next.days as any[])[slot!.dayIdx];
      const items: any[] = Array.isArray(day?.items) ? day.items : [];
      const curr = items[slot!.idx] ?? {};
      const placeId = raw.poi_id ?? raw.id ?? raw.place_id;
      const coords = raw.coordinates ?? raw.geo ?? (raw.lat && raw.lng ? { lat: raw.lat, lng: raw.lng } : undefined);
      const name = raw.name ?? raw.nameCN ?? raw.nameEN ?? curr?.location_ref?.name ?? 'POI';
      items[slot!.idx] = {
        ...curr,
        location_ref: {
          ...(curr.location_ref ?? {}),
          place_id: placeId ? String(placeId) : curr?.location_ref?.place_id,
          name,
          coordinates: coords ?? curr?.location_ref?.coordinates,
        },
        metadata: {
          ...(curr.metadata ?? {}),
          category: raw.category ?? curr?.metadata?.category,
        },
      };
      day.items = items;
      return next;
    };

    const degradedKeys = new Set<string>();
    const advisories: VerificationIssue[] = [];
    let chosen: any | undefined;

    for (const c of filtered.slice(0, 8)) {
      const raw = c.raw;
      const scratch = applyCandidate(itinerary, raw);
      const dayDate = String((scratch.days as any[])[slot.dayIdx]?.date ?? '');
      const arrival =
        (await this.estimateArrivalAtItemIndex(scratch, slot.dayIdx, slot.idx, ctx, this.buildTimelineEnvironment(_dso))) ??
        (dayDate ? new Date(`${dayDate}T12:00:00.000Z`) : undefined);
      if (!arrival || !Number.isFinite(arrival.getTime())) {
        chosen = raw;
        break;
      }

      const pid = String(raw.poi_id ?? raw.id ?? raw.place_id ?? '');
      let ohLike: any | undefined;
      if (pid && this.skillsRegistry) {
        const openingSkill = this.skillsRegistry.getSkill('opening_hours.get');
        if (openingSkill) {
          try {
            const oh = await openingSkill.execute({ poi_ids: [pid] } as any);
            const row = Array.isArray((oh as any)?.opening_hours) ? (oh as any).opening_hours[0] : undefined;
            ohLike =
              row?.opening_hours && typeof row.opening_hours === 'object'
                ? row.opening_hours
                : row ?? undefined;
          } catch (e: any) {
            this.logger.debug(`[RepairExecutor] opening_hours.get skipped: ${e?.message}`);
          }
        }
      }

      if (!ohLike) {
        chosen = raw;
        break;
      }

      const gate = isOpenAt(ohLike, arrival);
      if (!gate.open) continue;

      if (gate.degraded && !degradedKeys.has(pid)) {
        degradedKeys.add(pid);
        advisories.push({
          code: 'CONFIDENCE_DEGRADED',
          class: 'ADVISORY',
          message:
            '由于缺乏远期结构化营业时间（periods），系统基于 is_open_now 或文本摘要推测到达时是否营业；请在行前复核。',
          source: 'OTHER',
          at: new Date().toISOString(),
          entityRef: { type: 'POI', id: pid },
          metadata: {
            confidence_impact: -0.2,
            evidenceKind:
              gate.evidence === 'IS_OPEN_NOW_ONLY'
                ? 'IS_OPEN_NOW_ONLY'
                : gate.evidence === 'WEEKDAY_TEXT_ONLY'
                  ? 'WEEKDAY_TEXT_ONLY'
                  : 'NONE',
          },
        });
      }
      chosen = raw;
      break;
    }

    if (!chosen) return { ok: false };

    const next = applyCandidate(itinerary, chosen);
    return {
      ok: true,
      itinerary: next,
      postRepairAdvisories: advisories.length ? advisories : undefined,
    };
  }

  private resolveBottleneckPlaceId(itin: ItineraryLike, dayDate: string, bottleneckNodeId: string | undefined): string | undefined {
    if (!bottleneckNodeId) return undefined;
    const day = (itin.days as any[])?.find((d) => String(d.date) === String(dayDate));
    const items = Array.isArray(day?.items) ? day.items : [];
    const hit = items.find((it: any) => String(it?.id ?? '') === String(bottleneckNodeId));
    if (hit) {
      return String(hit?.location_ref?.place_id ?? hit?.poi_id ?? hit?.id ?? bottleneckNodeId);
    }
    return String(bottleneckNodeId);
  }

  /**
   * 日落无法在当日收敛且瓶颈为锚点户外时，向下一日发起 MIGRATION_REQUEST（由 Kernel 写入 systemState.pendingMigrations）。
   */
  private buildSunsetAnchorMigrations(
    dso: DecisionState,
    itin: ItineraryLike,
    fromDayDate: string,
    bottleneckNodeId: string | undefined,
  ): PendingMigrationRequest[] {
    const anchors = new Set((dso.poiPlanning?.poiPlan?.requiredAnchorPoiIds ?? []).map(String));
    const pid = this.resolveBottleneckPlaceId(itin, fromDayDate, bottleneckNodeId);
    if (!pid || !anchors.has(pid)) return [];
    const days = (itin.days as any[]) ?? [];
    const idx = days.findIndex((d) => String(d.date) === String(fromDayDate));
    if (idx < 0 || idx >= days.length - 1) return [];
    const toDayDate = String(days[idx + 1]!.date);
    const id = `mgr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return [
      {
        id,
        kind: 'MIGRATION_REQUEST',
        fromDayDate: String(fromDayDate),
        toDayDate: toDayDate,
        nodeId: pid,
        reason: 'SUNSET_ANCHOR_NOT_ASSIGNABLE_ON_DAY',
        createdAt: new Date().toISOString(),
      },
    ];
  }

  private buildTimelineEnvironment(dso: DecisionState): SolveDayTimelineEnvironment | undefined {
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

  private isIndoorLike(it: any): boolean {
    if (!it) return false;
    const typ = String(it.type ?? '').toUpperCase();
    if (typ === 'MEAL' || typ === 'MUSEUM' || typ === 'SHOPPING') return true;
    const cat = String(it.metadata?.category ?? '').toLowerCase();
    return /(museum|gallery|restaurant|spa|indoor|shopping|theater|theatre|cinema)/i.test(cat);
  }

  /** L1：将首个室内块与其后首个户外自然景观块交换，争取把户外挪到日落前 */
  private sunsetIndoorOutdoorReorderOneDay(itin: ItineraryLike, dayIdx: number): boolean {
    const day = (itin.days as any[])?.[dayIdx];
    const items: any[] = Array.isArray(day?.items) ? [...day.items] : [];
    if (items.length < 2) return false;
    let inIdx = -1;
    for (let i = 0; i < items.length; i++) {
      if (this.isIndoorLike(items[i])) inIdx = i;
    }
    if (inIdx < 0) return false;
    let outIdx = -1;
    for (let j = inIdx + 1; j < items.length; j++) {
      if (isOutdoorVisibilityConstrainedItem(items[j])) {
        outIdx = j;
        break;
      }
    }
    if (outIdx < 0) return false;
    [items[inIdx], items[outIdx]] = [items[outIdx], items[inIdx]];
    day.items = items;
    return true;
  }

  /** 用当日 solveDayTimeline 解析目标 item 的到达时刻（start_window） */
  private async estimateArrivalAtItemIndex(
    itinerary: ItineraryLike,
    dayIdx: number,
    itemIdx: number,
    ctx: PhaseExecutorContext,
    timelineEnv?: SolveDayTimelineEnvironment,
  ): Promise<Date | undefined> {
    if (!this.skillsRegistry) return undefined;
    const dayRow = (itinerary.days as any[])?.[dayIdx];
    if (!dayRow) return undefined;
    const items: any[] = Array.isArray(dayRow.items) ? dayRow.items : [];
    if (itemIdx < 0 || itemIdx >= items.length) return undefined;
    const coords = items.map((it) => {
      const prof = normalizeItem(it, {});
      return prof?.location ? { lat: prof.location.lat, lng: prof.location.lng } : undefined;
    });
    if (coords.some((c) => !c)) return undefined;

    const transport = this.skillsRegistry.getSkill('transport.search');
    const n = Math.max(0, items.length - 1);
    let etaMin = new Array(n).fill(30);
    if (transport && n > 0) {
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
        etaMin = results.map((r) => {
          if (r.status !== 'fulfilled') return 30;
          const best = (r.value as any)?.best_option;
          const mins = best?.duration_minutes ?? (r.value as any)?.options?.[0]?.duration_minutes;
          return typeof mins === 'number' && Number.isFinite(mins) ? Math.max(0, Math.round(mins)) : 30;
        });
      } catch {
        /* keep defaults */
      }
    }

    try {
      const solved = solveDayTimeline({
        day: { date: String(dayRow.date), items: items as any },
        adjacentEtaMin: etaMin,
        environment: timelineEnv,
      });
      if (!solved.ok || !solved.day?.items?.[itemIdx]) return undefined;
      const target = solved.day.items[itemIdx] as any;
      const w = parseItemWindow(String(dayRow.date), target);
      return w.start ?? undefined;
    } catch {
      return undefined;
    }
  }

  private async trySearchPoiReplacement(
    destination: string | undefined,
    around: { lat: number; lng: number } | undefined,
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    itinerary: ItineraryLike,
    /** 被替换的闭馆点，避免检索又召回同一 id */
    closedPoiId?: string,
    /** 闭馆项 category，供语义缺口规则（Gap v1） */
    closedItemCategoryHint?: string,
  ): Promise<{ pois?: Array<{ poi_id: string; coordinates?: { lat: number; lng: number }; category?: string }>; replacement?: any }> {
    if (!this.skillsRegistry) return {};
    if (!destination?.trim()) return {};
    const skill = this.skillsRegistry.getSkill('poi.search');
    if (!skill) return {};
    try {
      const recent = Array.isArray(ctx.recent_messages) ? ctx.recent_messages.filter((m) => typeof m === 'string').slice(-5) : [];
      const userMessage = recent.length ? recent.join('\n') : undefined;
      const poiSearchCtx = buildPoiSearchContext({
        destination,
        decisionState: dso,
        itinerary,
        userMessage,
      });
      const ctxSuffix = buildContextualPoiSearchQuerySuffix(poiSearchCtx);
      const baseQuery = `${destination!.trim()} attraction`;
      const causedByEvent = closedPoiId?.trim()
        ? ({ type: 'POI_CLOSED' as const, poiId: String(closedPoiId).trim().toLowerCase() } as const)
        : undefined;
      const semanticGaps = detectItineraryGapsV1({
        poiSearchCtx,
        decisionState: dso,
        itinerary,
        causedByEvent,
        closedItemCategoryHint: closedItemCategoryHint,
      });
      const gapSuffix = gapRetrievalIntentQuerySuffix(semanticGaps);
      const query = `${baseQuery}${ctxSuffix}${gapSuffix}`.replace(/\s+/g, ' ').trim();
      const r = await skill.execute({
        query,
        limit: 10,
        lat: around?.lat,
        lng: around?.lng,
      } as any);
      let pois = Array.isArray((r as any)?.pois) ? (r as any).pois : Array.isArray(r) ? r : [];
      const rej = [
        ...(poiSearchCtx.rejectedPoiIds ?? []),
        ...(closedPoiId ? [closedPoiId] : []),
      ];
      pois = filterPoisByRejectedIds(pois as any[], rej) as any[];
      const replacement = pois.find((p: any) => p && (p.poi_id || p.id || p.place_id));
      const hardRejectedIds = rej.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
      const replTrace = buildReplacementRetrievalDecisionTrace({
        poiSearchCtx,
        query,
        hardRejectedIds,
        mergedPoiCount: pois.length,
        retrievalReason: 'find_alternative_poi_same_category_near_closed_slot',
        causedByEvent,
        semanticGaps,
      });
      ctx.researchData = {
        ...(typeof ctx.researchData === 'object' && ctx.researchData ? ctx.researchData : {}),
        replacement_retrieval_trace: replTrace,
      } as Record<string, unknown>;
      return { pois, replacement };
    } catch {
      return {};
    }
  }

  private inferClosedItemProfile(
    issue: VerificationIssue,
    itinerary: ItineraryLike,
    ctx: PhaseExecutorContext,
  ): { closedProfile?: ReturnType<typeof normalizeItem>; closedCategory?: string } {
    const anchors = new Set<string>((ctx as any)?.anchors ?? []);
    const days = (itinerary?.days ?? []) as any[];
    // Best-effort: pick first POI-like item; future: use issue.entityRef to match exact item.
    const first = days.flatMap((d) => (Array.isArray(d.items) ? d.items : [])).find((it) => it?.location_ref?.place_id || it?.poi_id);
    const poiId = first?.location_ref?.place_id ?? first?.poi_id;
    const poiEvidence = (ctx.researchData as any)?.poi_evidence;
    let category: string | undefined;
    if (poiEvidence && poiId) {
      const arr = Array.isArray(poiEvidence) ? poiEvidence : Array.isArray(poiEvidence?.pois) ? poiEvidence.pois : [];
      const hit = arr.find((p: any) => String(p?.poi_id ?? p?.id ?? p?.place_id ?? '') === String(poiId));
      category = hit?.category ?? undefined;
    }
    const prof = normalizeItem(first, { anchors, categoryHint: category });
    return { closedProfile: prof, closedCategory: prof?.category };
  }

  /**
   * TIME_WINDOW_* → Swap/Shift Operator（最小实现）
   * - 仅对每一天 items 做一次相邻 swap（不假设时间字段格式）
   */
  private async timeWindowSwapShiftOperator(
    _issue: VerificationIssue,
    itinerary: ItineraryLike,
  ): Promise<{ ok: boolean; itinerary?: ItineraryLike }> {
    const next: ItineraryLike = { ...itinerary, days: itinerary.days.map((d) => ({ ...d, items: [...(d.items ?? [])] })) };
    for (const day of next.days as any[]) {
      const items: any[] = Array.isArray(day.items) ? day.items : [];
      if (items.length >= 2) {
        // Prefer swapping the first two POI-like items, otherwise swap first two.
        const poiIdxs = items
          .map((it, idx) => ({ it, idx }))
          .filter(({ it }) => it?.type === 'POI' || it?.location_ref?.place_id || it?.poi_id)
          .map(({ idx }) => idx);
        const a = poiIdxs[0] ?? 0;
        const b = poiIdxs[1] ?? 1;
        const swapped = [...items];
        [swapped[a], swapped[b]] = [swapped[b], swapped[a]];
        day.items = swapped;
        return { ok: true, itinerary: next };
      }
    }
    return { ok: false };
  }

  /**
   * ROUTE_INFEASIBLE → Route Optimizer（占位的确定性算子）
   * - 最小版本：在每天行程末尾插入一个 buffer/休息块（降低不可达/赶路风险）
   */
  private async routeBufferOperator(
    issue: VerificationIssue,
    itinerary: ItineraryLike,
  ): Promise<{ ok: boolean; itinerary?: ItineraryLike }> {
    // L1 fallback: keep simple buffer insertion when we cannot compute a time-feasible schedule.
    const next: ItineraryLike = { ...itinerary, days: itinerary.days.map((d) => ({ ...d, items: [...(d.items ?? [])] })) };
    for (const day of next.days as any[]) {
      const items: any[] = Array.isArray(day.items) ? day.items : [];
      items.push({
        id: `buffer-${Date.now()}`,
        type: 'REST',
        start_window: '',
        end_window: '',
        location_ref: { name: `Buffer(${issue.code})`, coordinates: undefined },
        notes: 'Inserted by deterministic route operator',
        evidence_refs: [],
        verified: false,
        metadata: { duration_minutes: 30 },
      });
      day.items = items;
      return { ok: true, itinerary: next };
    }
    return { ok: false };
  }

  /**
   * ROUTE_INFEASIBLE (L2)：通过 transport.search 并行计算相邻 ETA，然后求解时间线。
   */
  private async routeOptimizerOperatorL2(
    issue: VerificationIssue,
    dso: DecisionState,
    itinerary: ItineraryLike,
    ctx: PhaseExecutorContext,
  ): Promise<{
    ok: boolean;
    itinerary?: ItineraryLike;
    producedFatal?: VerificationIssue;
    escalationPlan?: RepairEscalationPlan;
    postRepairAdvisories?: VerificationIssue[];
    pendingMigrations?: PendingMigrationRequest[];
    recoverySignal?: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION';
  }> {
    if (!this.skillsRegistry) return { ok: false };
    const transport = this.skillsRegistry.getSkill('transport.search');
    if (!transport) return { ok: false };

    const out: ItineraryLike = { ...itinerary, days: itinerary.days.map((d) => ({ ...d, items: [...(d.items ?? [])] })) };
    for (let dayIdx = 0; dayIdx < out.days.length; dayIdx++) {
      let lastEtaMin: number[] = [];
      const tlEnv = this.buildTimelineEnvironment(dso);
      const trySolveOnce = async () => {
        const day: any = out.days[dayIdx];
        const items: any[] = Array.isArray(day.items) ? day.items : [];
        if (items.length < 2) return { tag: 'skip' as const };

        const coords = items.map((it) => {
          const prof = normalizeItem(it, {});
          return prof?.location ? { lat: prof.location.lat, lng: prof.location.lng } : undefined;
        });
        if (coords.some((c) => !c)) return { tag: 'no_coords' as const };

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
        const etaMin: number[] = results.map((r) => {
          if (r.status !== 'fulfilled') return 0;
          const best = (r.value as any)?.best_option;
          const mins = best?.duration_minutes ?? (r.value as any)?.options?.[0]?.duration_minutes;
          return typeof mins === 'number' && Number.isFinite(mins) ? Math.max(0, Math.round(mins)) : 0;
        });

        try {
          const solved = solveDayTimeline({
            day: { date: String(day.date), items: items as any },
            adjacentEtaMin: etaMin,
            environment: tlEnv,
          });
          if (solved.ok && solved.day) {
            lastEtaMin = etaMin;
            return { tag: 'ok' as const, solved };
          }
        } catch (e: any) {
          this.logger.debug(`[RepairExecutor] routeOptimizerOperatorL2 skipped: ${e?.message}`);
        }
        return { tag: 'skip' as const };
      };

      const r0 = await trySolveOnce();
      if (r0.tag === 'no_coords') continue;
      if (r0.tag !== 'ok') continue;

      let solved = r0.solved;
      let day: any = out.days[dayIdx];

      const applySolved = () => {
        day = out.days[dayIdx];
        day.items = solved.day!.items as any;
        day.metadata = {
          ...(day.metadata ?? {}),
          repair_route_opt_notes: solved.notes ?? [],
          repair_timeline_feasibility: solved.feasibility,
        };
        const prevExplain = (out.metadata?.explain_logs ?? []) as string[];
        out.metadata = {
          ...(out.metadata ?? {}),
          repair_timeline_feasibility: solved.feasibility,
          explain_logs: [...prevExplain, ...(solved.explainLogs ?? [])],
        };
      };
      applySolved();

      if (solved.feasibility.status === 'LIMIT_REACHED') {
        const sunsetLimited = solved.feasibility.violation === 'SUNSET';
        if (sunsetLimited && this.sunsetIndoorOutdoorReorderOneDay(out, dayIdx)) {
          const rSun = await trySolveOnce();
          if (rSun.tag === 'ok') {
            solved = rSun.solved;
            applySolved();
          }
        }
        if (solved.feasibility.status !== 'LIMIT_REACHED') {
          return { ok: true, itinerary: out };
        }

        const rel = await this.relaxationOperator(issue, dso, out, {
          preferBeforeNodeId: solved.feasibility.bottleneckNodeId,
          dayDate: String(day.date),
          ctx,
          relaxationCause: solved.feasibility.violation === 'SUNSET' ? 'SUNSET' : 'PHYSICAL',
        });
        if (rel.producedFatal) return { ok: false, producedFatal: rel.producedFatal };
        if (rel.ok && rel.itinerary) {
          out.days = rel.itinerary.days.map((d: any) => ({ ...d, items: [...(d.items ?? [])] }));
          out.metadata = { ...(out.metadata ?? {}), ...(rel.itinerary.metadata ?? {}) };
          const r1 = await trySolveOnce();
          if (r1.tag === 'ok') {
            solved = r1.solved;
            applySolved();
          }
        }
        if (solved.feasibility.status === 'LIMIT_REACHED') {
          const isSunsetEsc = solved.feasibility.violation === 'SUNSET';
          const clarification = isSunsetEsc
            ? '由于日落较早，户外自然景观的可视窗口在到达前已结束；建议减少下午户外点、提前出发，或将博物馆/用餐等室内活动挪到日落后。'
            : '由于路径可达性限制（如路况/闭馆窗口），当前交通方式或单日编排仍无法在营业/窗口结束前完成；建议增加天数、更换更快交通工具，或删除非必节点。';
          out.metadata = {
            ...(out.metadata ?? {}),
            repair_escalation: {
              code: 'PHYSICAL_LIMIT_REACHED',
              at: new Date().toISOString(),
              feasibility: solved.feasibility,
            },
            repair_suggested_user_clarification: clarification,
          };
          const at = new Date().toISOString();
          const pendingMigrations = isSunsetEsc
            ? this.buildSunsetAnchorMigrations(dso, out, String(day.date), solved.feasibility.bottleneckNodeId)
            : [];
          const EXTREME_ETA_MIN = Number(process.env.DECISION_EXTREME_ROUTE_ETA_MIN ?? '480');
          const extremeThreshold = Number.isFinite(EXTREME_ETA_MIN) && EXTREME_ETA_MIN > 0 ? EXTREME_ETA_MIN : 480;
          const allExtreme =
            lastEtaMin.length > 0 && lastEtaMin.every((m) => m >= extremeThreshold);
          const physAdvisory: VerificationIssue[] =
            !isSunsetEsc && allExtreme
              ? [
                  {
                    code: 'ROUTE_INFEASIBLE',
                    class: 'ADVISORY',
                    message:
                      '检测到各段路程预估时间极端偏长（如暴雪封路/路况异常）；建议当日以住宿点为中心安排休息或室内活动，路况缓解后再出行。',
                    source: 'OTHER',
                    at,
                  },
                ]
              : [];
          return {
            ok: false,
            itinerary: out,
            escalationPlan: {
              type: 'PHYSICAL_LIMIT_REACHED',
              reason: solved.feasibility.status,
              bottleneckNodeId: solved.feasibility.bottleneckNodeId,
              suggestedAction: solved.feasibility.suggestedEscalation,
              userClarificationSnippet: clarification,
              at,
              constraint: isSunsetEsc ? 'SUNSET_VISIBILITY' : 'PHYSICAL_CONNECTIVITY',
            },
            pendingMigrations: pendingMigrations.length ? pendingMigrations : undefined,
            postRepairAdvisories: physAdvisory.length ? physAdvisory : undefined,
            recoverySignal: !isSunsetEsc && allExtreme ? 'FAILED_RECOVERABLE' : undefined,
          };
        }
      }

      return { ok: true, itinerary: out };
    }

    // L1 fallback
    return this.routeBufferOperator(issue, itinerary);
  }

  /**
   * FATIGUE_* → Relaxation Operator（最小实现）
   * - 删除“非锚点”的尾部若干 item（以降低密度）
   * - 若将 requiredAnchorPoiIds 删除，则上抛一个 FATAL（局部效用/原则破坏）
   */
  private async relaxationOperator(
    _issue: VerificationIssue,
    dso: DecisionState,
    itinerary: ItineraryLike,
    opts?: {
      preferBeforeNodeId?: string;
      dayDate?: string;
      ctx?: PhaseExecutorContext;
      /** 与补位策略对齐：疲劳 vs 日落 vs 纯物理窗 */
      relaxationCause?: 'FATIGUE' | 'SUNSET' | 'PHYSICAL' | 'GENERAL';
    },
  ): Promise<{ ok: boolean; itinerary?: ItineraryLike; producedFatal?: VerificationIssue }> {
    const anchors = new Set<string>((dso.poiPlanning?.poiPlan?.requiredAnchorPoiIds ?? []).map(String));
    const next: ItineraryLike = { ...itinerary, days: itinerary.days.map((d) => ({ ...d, items: [...(d.items ?? [])] })) };
    for (const day of next.days as any[]) {
      if (opts?.dayDate && String(day.date ?? '') !== String(opts.dayDate)) continue;
      const items: any[] = Array.isArray(day.items) ? day.items : [];
      // 允许 2 个节点时也做一次放松（绝境封路/极夜：去掉非锚点后交由时间线再判定）
      if (items.length < 2) continue;
      // Utility-aware removal: drop the lowest utility non-anchor POI-like item.
      const scored = items
        .map((it, idx) => {
          const prof = normalizeItem(it, { anchors });
          const isAnchor = !!prof?.isAnchor;
          // Heuristic utility: anchors very high; POI baseline; REST/MEAL lower priority.
          const base = isAnchor ? 10_000 : (it?.type === 'POI' ? 100 : it?.type === 'MEAL' ? 60 : it?.type === 'REST' ? 40 : 50);
          const evidenceBoost = Array.isArray(it?.evidence_refs) ? Math.min(20, it.evidence_refs.length) : 0;
          const durationPenalty = typeof it?.metadata?.duration_minutes === 'number' ? Math.min(30, it.metadata.duration_minutes / 10) : 0;
          const score = base + evidenceBoost - durationPenalty;
          return { idx, it, prof, score, isAnchor };
        })
        .filter((s) => !s.isAnchor);

      if (scored.length === 0) {
        if (opts?.dayDate) {
          return this.relaxationOperator(_issue, dso, itinerary, {
            preferBeforeNodeId: opts.preferBeforeNodeId,
            ctx: opts?.ctx,
            relaxationCause: opts?.relaxationCause,
          });
        }
        return { ok: false };
      }
      const bIdx =
        opts?.preferBeforeNodeId != null && opts.preferBeforeNodeId !== ''
          ? items.findIndex((it: any) => String(it?.id ?? '') === String(opts.preferBeforeNodeId))
          : -1;
      let pool = scored;
      if (bIdx >= 0) {
        const before = scored.filter((s) => s.idx < bIdx);
        if (before.length > 0) pool = before;
      }
      pool.sort((a, b) => a.score - b.score);
      const insertIdx = pool[0]!.idx;
      const removedScore = pool[0]!.score;
      const removed = items.splice(insertIdx, 1)[0];
      day.items = items;

      const removedId = String(removed?.location_ref?.place_id ?? removed?.poi_id ?? removed?.id ?? removed?.place_id ?? '');
      if (removedId && anchors.has(removedId)) {
        return {
          ok: false,
          producedFatal: {
            code: 'UNKNOWN',
            class: 'FATAL',
            message: `Relaxation 删除了锚点 POI(${removedId})，会导致路线哲学/必去点破坏，停止自动修复`,
            source: 'OTHER',
            at: new Date().toISOString(),
            suggestedActions: [{ action: 'ASK_USER', detail: 'anchor removed; needs confirmation' }],
          },
        };
      }
      if (opts?.ctx) {
        await this.backfillAfterRelaxation(dso, next, opts.ctx, {
          dayDate: String(day.date ?? ''),
          index: insertIdx,
          removedScore,
          removed,
          compensation: opts.relaxationCause ?? 'GENERAL',
        });
      }
      return { ok: true, itinerary: next };
    }
    if (opts?.dayDate) {
      return this.relaxationOperator(_issue, dso, itinerary, {
        preferBeforeNodeId: opts.preferBeforeNodeId,
        ctx: opts?.ctx,
        relaxationCause: opts?.relaxationCause,
      });
    }
    return { ok: false };
  }

  private cloneItinerary(itin: ItineraryLike): ItineraryLike {
    return {
      ...itin,
      days: (itin.days as any[]).map((d) => ({
        ...d,
        items: [...(Array.isArray(d.items) ? d.items : [])],
      })),
      metadata: { ...(itin.metadata ?? {}) },
    };
  }

  private async buildAdjacentEtaMinForItems(items: any[], ctx: PhaseExecutorContext): Promise<number[]> {
    const n = Math.max(0, items.length - 1);
    const fallback = new Array(n).fill(30);
    if (!this.skillsRegistry || n === 0) return fallback;
    const transport = this.skillsRegistry.getSkill('transport.search');
    if (!transport) return fallback;
    const coords = items.map((it) => {
      const prof = normalizeItem(it, {});
      return prof?.location ? { lat: prof.location.lat, lng: prof.location.lng } : undefined;
    });
    if (coords.some((c) => !c)) return fallback;
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
      return fallback;
    }
  }

  private async runSolveDayTimelineForDay(
    itin: ItineraryLike,
    dayIdx: number,
    dso: DecisionState,
    ctx: PhaseExecutorContext,
    dryRun?: boolean,
  ): Promise<ReturnType<typeof solveDayTimeline> | undefined> {
    const day: any = (itin.days as any[])?.[dayIdx];
    if (!day) return undefined;
    const items: any[] = Array.isArray(day.items) ? day.items : [];
    if (items.length < 2) return undefined;
    const coords = items.map((it) => {
      const prof = normalizeItem(it, {});
      return prof?.location ? { lat: prof.location.lat, lng: prof.location.lng } : undefined;
    });
    if (coords.some((c) => !c)) return undefined;
    const etaMin = await this.buildAdjacentEtaMinForItems(items, ctx);
    try {
      return solveDayTimeline({
        day: { date: String(day.date), items: items as any },
        adjacentEtaMin: etaMin,
        environment: this.buildTimelineEnvironment(dso),
        dryRun: !!dryRun,
      });
    } catch (e: any) {
      this.logger.debug(`[RepairExecutor] runSolveDayTimelineForDay skipped: ${e?.message}`);
      return undefined;
    }
  }

  private toPoiEvidenceArray(rd: unknown): any[] {
    const pe = (rd as any)?.poi_evidence;
    if (!pe) return [];
    if (Array.isArray(pe)) return pe;
    if (Array.isArray(pe?.pois)) return pe.pois;
    return [];
  }

  private normalizeEvidenceUtility(ev: any): number {
    let u = ev?.utility_score ?? ev?.utility ?? ev?.UtilityScore;
    if (typeof u !== 'number' || !Number.isFinite(u)) return 55;
    if (u <= 1) u *= 100;
    return Math.max(0, Math.min(100, u));
  }

  private evidenceCoords(p: any): { lat: number; lng: number } | undefined {
    const lat = p?.coordinates?.lat ?? p?.lat ?? p?.location?.lat;
    const lng = p?.coordinates?.lng ?? p?.lng ?? p?.location?.lng;
    if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
    return undefined;
  }

  private evidenceIsIndoor(p: any): boolean {
    if (p?.isIndoor === true) return true;
    return this.isIndoorLike({ type: 'POI', metadata: { category: p?.category ?? p?.poi_category } });
  }

  private collectExistingPoiIds(itin: ItineraryLike, anchors: Set<string>): Set<string> {
    const s = new Set<string>();
    for (const d of itin.days as any[]) {
      for (const it of Array.isArray(d.items) ? d.items : []) {
        const pid = String(it?.location_ref?.place_id ?? it?.poi_id ?? it?.id ?? it?.place_id ?? '');
        if (pid) s.add(pid);
      }
    }
    for (const a of anchors) s.add(a);
    return s;
  }

  /** 日落补位：仅强室内证据（含 isIndoor），排除明显户外向命名 */
  private strictIndoorEvidence(p: any): boolean {
    if (p?.isIndoor === true) return true;
    if (this.looksLikeOutdoorScenicEvidence(p)) return false;
    return this.evidenceIsIndoor(p);
  }

  private looksLikeOutdoorScenicEvidence(p: any): boolean {
    const s = `${p?.category ?? ''} ${p?.poi_category ?? ''} ${p?.name ?? ''} ${p?.title ?? ''}`.toLowerCase();
    return /(viewpoint|scenic|trail|hiking|glacier|beach|waterfall|volcano|fjord|aurora\s*spot|observatory\s*deck)/i.test(s);
  }

  /** 疲劳补位：咖啡/轻餐/茶馆等低走动恢复点 */
  private isRestOrCafeEvidence(p: any): boolean {
    const cat = String(p?.category ?? p?.poi_category ?? '').toLowerCase();
    const name = String(p?.name ?? p?.title ?? '').toLowerCase();
    const blob = `${cat} ${name}`;
    if (/(coffee|cafe|café|tea\s*house|bakery|bistro|brunch|轻食|甜品)/i.test(blob)) return true;
    if (/(restaurant|dining|pub|bar|lounge)/i.test(blob) && this.evidenceIsIndoor(p)) return true;
    const typ = String(p?.type ?? p?.poi_type ?? '').toUpperCase();
    if (typ === 'MEAL' || typ === 'REST') return true;
    return false;
  }

  private selectBackfillCandidates(
    ctx: PhaseExecutorContext,
    near: { lat: number; lng: number },
    targetUtility: number,
    existingIds: Set<string>,
    compensation: 'FATIGUE' | 'SUNSET' | 'PHYSICAL' | 'GENERAL',
    preferIndoorSoft: boolean,
  ): any[] {
    const raw = this.toPoiEvidenceArray(ctx.researchData);
    const radiusCfg = Number(process.env.DECISION_BACKFILL_RADIUS_M ?? '5000');
    const radiusM = Number.isFinite(radiusCfg) && radiusCfg > 0 ? radiusCfg : 5000;
    const uMin = compensation === 'FATIGUE' ? 25 : 38;
    const cands = raw.filter((p) => {
      const pid = String(p?.poi_id ?? p?.id ?? p?.place_id ?? '');
      if (!pid || existingIds.has(pid)) return false;
      const c = this.evidenceCoords(p);
      if (!c) return false;
      const d = haversineMeters(near, c);
      if (d > radiusM) return false;
      const u = this.normalizeEvidenceUtility(p);
      if (u < uMin || u > 88) return false;
      if (compensation === 'SUNSET') {
        if (!this.strictIndoorEvidence(p)) return false;
      } else if (compensation === 'FATIGUE') {
        if (!this.isRestOrCafeEvidence(p)) return false;
      } else if (preferIndoorSoft && !this.evidenceIsIndoor(p)) {
        return false;
      }
      return true;
    });
    cands.sort((a, b) => {
      const da = Math.abs(this.normalizeEvidenceUtility(a) - targetUtility);
      const db = Math.abs(this.normalizeEvidenceUtility(b) - targetUtility);
      if (da !== db) return da - db;
      const ca = this.evidenceCoords(a)!;
      const cb = this.evidenceCoords(b)!;
      return haversineMeters(near, ca) - haversineMeters(near, cb);
    });
    return cands;
  }

  private buildFatigueSyntheticRestItem(near: { lat: number; lng: number }): any {
    const id = `backfill-rest-${Date.now()}`;
    return {
      id,
      type: 'REST',
      start_window: '',
      end_window: '',
      location_ref: {
        name: 'Coffee / rest break (auto)',
        coordinates: { lat: near.lat, lng: near.lng },
      },
      evidence_refs: [],
      verified: false,
      metadata: { duration_minutes: 30, category: 'cafe_break', origin: 'RELAXATION_BACKFILL_FATIGUE' },
      notes: 'Low-walk fatigue buffer inserted after relaxation',
    };
  }

  private backfillItemFromCandidate(cand: any, near: { lat: number; lng: number }, compensation: string): any {
    if (cand?.__fatigueSynthetic) return this.buildFatigueSyntheticRestItem(near);
    const it = this.poiEvidenceToBackfillItem(cand);
    if (compensation === 'FATIGUE' && it.metadata) {
      it.metadata = { ...it.metadata, duration_minutes: Math.min(40, Number(it.metadata.duration_minutes) || 45) };
    }
    return it;
  }

  private poiEvidenceToBackfillItem(p: any): any {
    const pid = String(p?.poi_id ?? p?.id ?? p?.place_id ?? `bf-${Date.now()}`);
    const c = this.evidenceCoords(p);
    return {
      id: `backfill-${pid}`,
      type: 'POI',
      start_window: '',
      end_window: '',
      location_ref: {
        name: String(p?.name ?? p?.title ?? '备选点'),
        place_id: pid,
        coordinates: c ? { lat: c.lat, lng: c.lng } : undefined,
      },
      poi_id: pid,
      evidence_refs: p?.evidence_id ? [p.evidence_id] : [],
      verified: false,
      metadata: { duration_minutes: 45, category: p?.category, origin: 'RELAXATION_BACKFILL' },
      notes: 'Auto-filled gap after relaxation (utility-neutral backfill)',
    };
  }

  private shouldPreferIndoorBackfill(dso: DecisionState, dayDate: string, removed: any): boolean {
    const env = this.buildTimelineEnvironment(dso);
    if (!env?.sunsetByDate?.[dayDate] && !env?.sunsetByDate?.[String(dayDate).slice(0, 10)]) return false;
    if (isOutdoorVisibilityConstrainedItem(removed)) return true;
    const ti = typeof removed?.type === 'string' ? removed.type.toUpperCase() : '';
    if (ti === 'POI' && !this.isIndoorLike(removed)) return true;
    return false;
  }

  /**
   * Relaxation 删掉非锚点后，在释放位置尝试插入「低打扰、顺路、效用接近」的 evidence POI；
   * 若 solveDayTimeline 出现新的日落 LIMIT 或其它 LIMIT，则放弃该候选（不修改 itin）。
   * compensation：FATIGUE→REST/咖啡证据或短休息块；SUNSET→仅强室内；其它→沿用日照启发式 + 可放宽。
   */
  private async backfillAfterRelaxation(
    dso: DecisionState,
    itin: ItineraryLike,
    ctx: PhaseExecutorContext,
    slot: {
      dayDate: string;
      index: number;
      removedScore: number;
      removed: any;
      compensation: 'FATIGUE' | 'SUNSET' | 'PHYSICAL' | 'GENERAL';
    },
  ): Promise<void> {
    if (!ctx.researchData && slot.compensation !== 'FATIGUE') return;
    const dayIdx = (itin.days as any[]).findIndex((d) => String(d.date) === String(slot.dayDate));
    if (dayIdx < 0) return;
    const day = (itin.days as any[])[dayIdx];
    const items: any[] = Array.isArray(day.items) ? [...day.items] : [];
    if (slot.index < 0 || slot.index > items.length) return;

    const neighbors: { lat: number; lng: number }[] = [];
    const pushC = (it: any) => {
      const prof = normalizeItem(it, {});
      if (prof?.location) neighbors.push({ lat: prof.location.lat, lng: prof.location.lng });
    };
    if (slot.index > 0) pushC(items[slot.index - 1]);
    if (slot.index < items.length) pushC(items[slot.index]);
    if (neighbors.length === 0) return;
    const near = {
      lat: neighbors.reduce((s, p) => s + p.lat, 0) / neighbors.length,
      lng: neighbors.reduce((s, p) => s + p.lng, 0) / neighbors.length,
    };

    const anchors = new Set<string>((dso.poiPlanning?.poiPlan?.requiredAnchorPoiIds ?? []).map(String));
    const existingIds = this.collectExistingPoiIds(itin, anchors);

    const preferIndoorSoft =
      slot.compensation === 'SUNSET'
        ? false
        : slot.compensation === 'FATIGUE'
          ? false
          : this.shouldPreferIndoorBackfill(dso, slot.dayDate, slot.removed);

    let cands = this.selectBackfillCandidates(
      ctx,
      near,
      slot.removedScore,
      existingIds,
      slot.compensation,
      preferIndoorSoft,
    );
    if (
      cands.length === 0 &&
      preferIndoorSoft &&
      (slot.compensation === 'GENERAL' || slot.compensation === 'PHYSICAL')
    ) {
      cands = this.selectBackfillCandidates(ctx, near, slot.removedScore, existingIds, slot.compensation, false);
    }

    const fatigueSynthetic =
      slot.compensation === 'FATIGUE' && cands.length === 0 ? [{ __fatigueSynthetic: true }] : [];
    const tryList = [...cands, ...fatigueSynthetic].slice(0, 6);

    for (const cand of tryList) {
      const probe = this.cloneItinerary(itin);
      const d2 = (probe.days as any[])[dayIdx];
      const its = [...(Array.isArray(d2.items) ? d2.items : [])];
      const insertItem = this.backfillItemFromCandidate(cand, near, slot.compensation);
      its.splice(slot.index, 0, insertItem);
      d2.items = its;

      const solved = await this.runSolveDayTimelineForDay(probe, dayIdx, dso, ctx, false);
      if (!solved?.ok || !solved.day) continue;
      if (solved.feasibility.status === 'LIMIT_REACHED') continue;

      const targetDay = (itin.days as any[])[dayIdx];
      targetDay.items = solved.day.items as any;
      const baseExplain = (itin.metadata?.explain_logs ?? []) as string[];
      const tag = `[补位] 放松删点后插入轻量备选：${insertItem.location_ref?.name ?? insertItem.id}`;
      itin.metadata = {
        ...(itin.metadata ?? {}),
        explain_logs: [...baseExplain, tag, ...(solved.explainLogs ?? [])],
      };
      targetDay.metadata = {
        ...(targetDay.metadata ?? {}),
        repair_timeline_feasibility: solved.feasibility,
        repair_route_opt_notes: [...((targetDay.metadata as any)?.repair_route_opt_notes ?? []), ...(solved.notes ?? [])],
      };
      return;
    }
  }

  private toTripPlanRequest(
    req: PhaseExecutorContext['tripPlanRequest'],
    requestId: string,
  ): TripPlanRequest {
    return {
      request_id: requestId,
      message: (req as any)?.message,
      origin: (req?.origin ?? '') as TripPlanRequest['origin'],
      destination: (req?.destination ?? '') as TripPlanRequest['destination'],
      date_range: req?.date_range,
      start_date: req?.start_date,
      days: req?.days,
      mode: req?.mode as TripPlanRequest['mode'],
      party: req?.party as TripPlanRequest['party'],
      party_profile: req?.party_profile as TripPlanRequest['party_profile'],
      constraints: (req as any)?.constraints,
    };
  }
}
