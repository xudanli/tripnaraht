import { Injectable } from '@nestjs/common';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { DecisionKernelService } from '../../decision/kernel/decision-kernel.service';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState, TripPlanRequest } from '../interfaces/trip-plan.interface';
import type { SimulatedRepairTrace } from './route-feasibility.types';
import type { CasePrecedent } from '../cbr/case-record.types';
import { LocalCaseStoreService } from '../cbr/local-case-store.service';

export interface EarlyWarningSuggestedAction {
  relaxation_type: string;
  shadow_confidence: 'high_probability_fixed' | 'needs_more_changes';
  impact_description: string;
  fixed_conflict_types?: string[];
  violations_before?: number;
  violations_after?: number;
}

export interface EarlyWarning {
  early_warning_id?: string;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  conflict_type: 'REACHABILITY' | 'SCOPE' | 'MIXED';
  evidence_summary: string;
  suggested_actions: EarlyWarningSuggestedAction[];
  /**
   * Case-Based Reasoning (CBR) 占位：相似判例摘要（先 Mock，后续接向量检索/仓库）。
   * 供 Orchestrator UI / Narrator 做“历史教训”式劝说。
   */
  historical_precedents?: CasePrecedent[];
  /** INTAKE 强类型仿真卡片（与 Shadow EW 叠加；供 UI / 训练直接消费） */
  predictive_failure_report?: {
    card_type: 'PREDICTIVE_FAILURE_REPORT';
    /** 与 `buildDecisionFeedbackCorrelationId` 对齐；澄清/埋点原样回传以 join 审计 */
    correlationId?: string;
    audit_text: string;
    simulated_repair_traces: SimulatedRepairTrace[];
  };
}

@Injectable()
export class ShadowConflictScannerService {
  constructor(private readonly caseStore?: LocalCaseStoreService) {}

  scan(
    input: {
      decisionKernel?: DecisionKernelService;
      decisionState?: DecisionState;
      state: OrchestratorState;
      request: RouteAndRunRequestDto;
    },
  ): Promise<EarlyWarning | undefined> {
    const { decisionKernel, decisionState, state, request } = input;
    if (!decisionKernel || !decisionState || !state.trip_plan_request) return Promise.resolve(undefined);
    return this.scanWithShadowGate({ decisionKernel, decisionState, state, request });
  }

  private async scanWithShadowGate(args: {
    decisionKernel: DecisionKernelService;
    decisionState: DecisionState;
    state: OrchestratorState;
    request: RouteAndRunRequestDto;
  }): Promise<EarlyWarning | undefined> {
    const { decisionKernel, decisionState, state, request } = args;
    const trip = state.trip_plan_request!;

    // --- Heuristic signals (space + admission) ---
    const mustCount = Array.isArray(trip.must_include_poi_ids) ? trip.must_include_poi_ids.length : 0;
    const days = typeof trip.days === 'number' && Number.isFinite(trip.days) ? trip.days : undefined;
    const scopeRisk = mustCount > 0 && typeof days === 'number' ? mustCount > Math.max(1, Math.floor(days) + 1) : false;

    const vehicleRequiredRaw =
      (decisionState.environmentState as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
      (decisionState.environmentState as any)?.routeCorridorWorld?.constraints?.vehicle_requirement ??
      (state.research_data as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
      (state.research_data as any)?.route_corridor_world?.constraints?.vehicleRequired;
    const vehicleRequired = typeof vehicleRequiredRaw === 'string' ? vehicleRequiredRaw.toLowerCase() : '';
    const need4x4 = /4x4|4wd|四驱/.test(vehicleRequired);
    const vehicleType = (trip.constraints as any)?.vehicle_type as '2WD' | '4WD' | undefined;
    const is2wd = vehicleType === undefined ? true : vehicleType === '2WD';
    const reachabilityRisk = need4x4 && is2wd;

    if (!reachabilityRisk && !scopeRisk) return undefined;

    const conflict_type: EarlyWarning['conflict_type'] =
      reachabilityRisk && scopeRisk ? 'MIXED' : reachabilityRisk ? 'REACHABILITY' : 'SCOPE';

    const risk_level: EarlyWarning['risk_level'] =
      reachabilityRisk && scopeRisk ? 'CRITICAL' : reachabilityRisk ? 'HIGH' : scopeRisk ? 'MEDIUM' : 'LOW';

    const evidence_summary = reachabilityRisk
      ? `发现硬冲突：当前车辆能力为 ${vehicleType ?? '2WD(assumed)'}，但路线要求 ${String(vehicleRequiredRaw ?? '4WD/4x4')}。`
      : `发现范围冲突：必去点数量=${mustCount} 与天数=${String(days ?? 'n/a')} 的组合可能导致容量不足。`;

    // --- Shadow Gate Dry-Run: reuse Kernel.executeGateEval ---
    const baseCtx = {
      requestId: state.request_id,
      routeDirectionId: request.route_direction_id ?? undefined,
      userId: request.user_id,
      researchData: state.research_data,
    };

    const clone = <T,>(v: T): T => {
      const sc = (globalThis as any).structuredClone as ((x: any) => any) | undefined;
      if (typeof sc === 'function') return sc(v);
      return JSON.parse(JSON.stringify(v)) as T;
    };

    const baseGate = await decisionKernel.executeGateEval(clone(decisionState), {
      ...baseCtx,
      tripPlanRequest: trip as any,
    } as any);
    const baseViolations = (baseGate.gateResult.violations ?? []) as Array<{ type?: string }>;
    const beforeCount = baseViolations.length;
    const beforeTypes = new Set(baseViolations.map((v) => String(v?.type ?? '')).filter(Boolean));

    const run = async (patchedTrip: TripPlanRequest): Promise<EarlyWarningSuggestedAction> => {
      const out = await decisionKernel.executeGateEval(clone(decisionState), {
        ...baseCtx,
        tripPlanRequest: patchedTrip as any,
      } as any);
      const vs = (out.gateResult.violations ?? []) as Array<{ type?: string }>;
      const afterCount = vs.length;
      const afterTypes = new Set(vs.map((v) => String(v?.type ?? '')).filter(Boolean));
      const fixedTypes = Array.from(beforeTypes).filter((t) => !afterTypes.has(t));
      const fixed = afterCount === 0;
      const improved = afterCount < beforeCount;
      return {
        relaxation_type: 'unknown',
        shadow_confidence: fixed ? 'high_probability_fixed' : 'needs_more_changes',
        impact_description: fixed
          ? '影子推演显示可消除全部冲突'
          : improved
            ? `影子推演显示冲突数下降 ${beforeCount}→${afterCount}`
            : '影子推演显示单一调整仍不足以消除冲突',
        fixed_conflict_types: fixedTypes,
        violations_before: beforeCount,
        violations_after: afterCount,
      };
    };

    const suggestions: EarlyWarningSuggestedAction[] = [];

    if (reachabilityRisk) {
      const patched: TripPlanRequest = { ...clone(trip), constraints: { ...(trip.constraints ?? {}), vehicle_type: '4WD' } };
      const r = await run(patched);
      suggestions.push({
        ...r,
        relaxation_type: 'upgrade_vehicle_to_4wd',
        impact_description: `升级为 4WD（满足车辆要求：${String(vehicleRequiredRaw ?? '4WD/4x4')}）｜${r.impact_description}`,
      });
    }
    if (scopeRisk) {
      const patched: TripPlanRequest = clone(trip);
      if (patched.date_range?.end_date) {
        const end = new Date(patched.date_range.end_date + 'T00:00:00Z');
        if (!Number.isNaN(end.getTime())) {
          const plus = new Date(end);
          plus.setUTCDate(plus.getUTCDate() + 1);
          patched.date_range = { ...patched.date_range, end_date: plus.toISOString().slice(0, 10) };
        }
      } else if (typeof patched.days === 'number' && Number.isFinite(patched.days)) {
        patched.days = Math.max(1, Math.floor(patched.days) + 1);
      }
      const r = await run(patched);
      suggestions.push({
        ...r,
        relaxation_type: 'increase_days_by_1',
        impact_description: `总天数 +1｜${r.impact_description}`,
      });

      const patched2: TripPlanRequest = clone(trip);
      const must = Array.isArray(patched2.must_include_poi_ids) ? [...patched2.must_include_poi_ids] : [];
      if (must.length > 0) {
        must.pop();
        patched2.must_include_poi_ids = must;
      }
      const r2 = await run(patched2);
      suggestions.push({
        ...r2,
        relaxation_type: 'drop_one_must_include_poi',
        impact_description: `移除 1 个必去点｜${r2.impact_description}`,
      });
    }

    const historical_precedents = await this.searchSimilarCases({
      conflict_type,
      risk_level,
      evidence_summary,
      suggested_actions: suggestions,
      request,
      state,
      decisionState,
    });

    return {
      risk_level,
      conflict_type,
      evidence_summary,
      suggested_actions: suggestions,
      ...(historical_precedents.length > 0 ? { historical_precedents } : {}),
    };
  }

  /**
   * CBR 检索占位（MVP）：
   * - 先返回规则驱动的 Mock 判例
   * - 后续替换为：CaseRecord 仓库 + 向量检索 + 统计聚合
   */
  private async searchSimilarCases(input: {
    conflict_type: EarlyWarning['conflict_type'];
    risk_level: EarlyWarning['risk_level'];
    evidence_summary: string;
    suggested_actions: EarlyWarningSuggestedAction[];
    request: RouteAndRunRequestDto;
    state: OrchestratorState;
    decisionState: DecisionState;
  }): Promise<CasePrecedent[]> {
    const relax = (input.suggested_actions ?? []).map((s) => s.relaxation_type).filter(Boolean);
    const month = (() => {
      const s = (input.state.trip_plan_request as any)?.start_date ?? input.state.trip_plan_request?.date_range?.start_date;
      if (!s) return undefined;
      const d = new Date(String(s));
      const m = d.getUTCMonth() + 1;
      return Number.isFinite(m) && m >= 1 && m <= 12 ? m : undefined;
    })();
    const region_id = (input.state.trip_plan_request as any)?.region_id ?? (input.decisionState.userIntent as any)?.regionId;
    const primary_violation_type =
      String(((input.decisionState as any)?.constraints?.violations?.[0]?.type ?? '')).trim() ||
      undefined;

    const real = this.caseStore?.search({
      conflict_type: input.conflict_type,
      primary_violation_type,
      ...(region_id ? { region_id: String(region_id) } : {}),
      ...(typeof month === 'number' ? { month } : {}),
      relaxation_types: relax,
      limit: 3,
    });
    if (real && real.length > 0) return real;

    // fallback: no precedents yet
    return [];
  }
}

