/**
 * RepairExecutorService
 *
 * 实现 IRepairExecutor，执行 REPAIR 阶段
 * LocalInsightAgent.suggestAlternatives + repair.apply Skill
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
import { ClaudeLocalInsightAgentService } from '../services/sub-agents/local-insight-agent.service';
import type { TripPlanRequest, GateResult } from '../interfaces/trip-plan.interface';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

@Injectable()
export class RepairExecutorService implements IRepairExecutor {
  private readonly logger = new Logger(RepairExecutorService.name);

  constructor(
    @Optional() private readonly skillsRegistry?: SkillsRegistryService,
    @Optional() private readonly localInsightAgent?: ClaudeLocalInsightAgentService,
  ) {}

  async execute(
    dso: DecisionState,
    ctx: PhaseExecutorContext,
  ): Promise<{
    itinerary?: ItineraryLike;
    repairApplied: boolean;
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

    // 0. 靶向治疗：优先读取 DSO.verification.issues（仅处理 CONFLICT）
    const report = dso.verification;
    const conflictIssues = (report?.issues ?? []).filter((i) => i.class === 'CONFLICT');
    if (itinerary && conflictIssues.length > 0) {
      for (const issue of conflictIssues) {
        const out = await this.tryDeterministicRepair(issue, dso, itinerary, ctx);
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

    return {
      itinerary,
      repairApplied,
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
    producedFatal?: VerificationIssue;
    escalationPlan?: RepairEscalationPlan;
    postRepairAdvisories?: VerificationIssue[];
    pendingMigrations?: PendingMigrationRequest[];
    recoverySignal?: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION';
  }> {
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

    const searched = await this.trySearchPoiReplacement(dest, closedLoc);
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
      let arrival =
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
    const buf = Number(process.env.DECISION_REPAIR_TWILIGHT_BUFFER_MIN ?? '');
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
    destination?: string,
    around?: { lat: number; lng: number },
  ): Promise<{ pois?: Array<{ poi_id: string; coordinates?: { lat: number; lng: number }; category?: string }>; replacement?: any }> {
    if (!this.skillsRegistry) return {};
    if (!destination?.trim()) return {};
    const skill = this.skillsRegistry.getSkill('poi.search');
    if (!skill) return {};
    try {
      const r = await skill.execute({
        query: `${destination} attraction`,
        limit: 10,
        lat: around?.lat,
        lng: around?.lng,
      } as any);
      const pois = Array.isArray((r as any)?.pois) ? (r as any).pois : Array.isArray(r) ? r : [];
      const replacement = pois.find((p: any) => p && (p.poi_id || p.id || p.place_id));
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
      origin: (req?.origin ?? '') as TripPlanRequest['origin'],
      destination: (req?.destination ?? '') as TripPlanRequest['destination'],
      date_range: req?.date_range,
      start_date: req?.start_date,
      days: req?.days,
      mode: req?.mode as TripPlanRequest['mode'],
      party: req?.party as TripPlanRequest['party'],
      party_profile: req?.party_profile as TripPlanRequest['party_profile'],
    };
  }
}
