import type { DecisionKernelService } from '../../../decision/kernel/decision-kernel.service';
import type { PlanGenTerminalFailure } from '../../../decision/kernel/decision-state.types';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import { SYSTEM_ORCHESTRATOR_ACTIONS } from '../../constants/action-execution.constants';
import type { LocalCaseStoreService } from '../../cbr/local-case-store.service';
import { ConstraintScorer, type RelaxationActionId } from '../../cbr/constraint-scorer.util';
import { groupMinCutPaths } from '../../cbr/option-grouper.util';
import { SignatureBuilder } from '../../cbr/signature-builder.util';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { AgentContext, OrchestrationResult } from '../../interfaces/claude-orchestration.interface';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import type { PlanGenEmptyDraftGuardParams } from './plan-verify-loop.types';

export interface PlanGenEmptyDraftGuardHost {
  getDecisionKernel(): DecisionKernelService | undefined;
  getLocalCaseStore(): LocalCaseStoreService | undefined;

  violationTypeToCn(type: string): string;
  buildClarificationResult(
    state: OrchestratorState,
    startTime: number,
    decisionState: DecisionState | undefined,
    context: AgentContext,
  ): OrchestrationResult;
  maybeSnapshot(state: OrchestratorState, kind: string): void;
  warn(message: string): void;
}

/**
 * PLAN_GEN 空草案：构造澄清出口并短路后续 OPTIMIZE/VERIFY/NARRATE。
 * @returns 若应终止则返回 OrchestrationResult，否则 null
 */
export async function tryPlanGenEmptyDraftTerminal(
  host: PlanGenEmptyDraftGuardHost,
  params: PlanGenEmptyDraftGuardParams,
): Promise<OrchestrationResult | null> {
  const { request, context, state, startTime } = params;
  let decisionState = params.decisionState;

  const itineraryDays = Array.isArray((state.itinerary as any)?.days) ? (state.itinerary as any).days.length : 0;
  const decisionKernel = host.getDecisionKernel();
  if (itineraryDays === 0 && decisionKernel && decisionState && !decisionState.systemState?.planGenTerminalFailure) {
    const inconsistent: PlanGenTerminalFailure = {
      code: 'INCONSISTENT_EMPTY_DRAFT',
      message: 'Itinerary is empty but no terminal failure was signaled.',
    };
    decisionState = decisionKernel.updateState(decisionState, {
      systemState: {
        requestId: state.request_id,
        currentPhase: 'PLAN_GEN',
        planGenTerminalFailure: inconsistent,
      } as any,
    });
  }

  const planGenTf = decisionState?.systemState?.planGenTerminalFailure;
  if (!planGenTf) {
    return null;
  }

  host.warn(
    `[Claude Orchestrator] PLAN_GEN 空草案终止: code=${planGenTf.code} system_action=${SYSTEM_ORCHESTRATOR_ACTIONS.PLAN_GEN_EMPTY_DRAFT_HALT}`,
  );

  const mustInclude =
    decisionState?.userIntent?.mustIncludePoiIds ??
    (state.trip_plan_request as any)?.must_include_poi_ids ??
    [];
  const days =
    decisionState?.userIntent?.days ?? (state.trip_plan_request as any)?.days ?? undefined;

  const vehicleRequiredRaw =
    (decisionState?.environmentState as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
    (decisionState?.environmentState as any)?.routeCorridorWorld?.constraints?.vehicle_requirement ??
    (state.research_data as any)?.routeCorridorWorld?.constraints?.vehicleRequired ??
    (state.research_data as any)?.route_corridor_world?.constraints?.vehicleRequired;
  const vehicleRequired = typeof vehicleRequiredRaw === 'string' ? vehicleRequiredRaw.toLowerCase() : '';
  const explicitVehicleType = (state.trip_plan_request as any)?.constraints?.vehicle_type as '2WD' | '4WD' | undefined;

  const need4x4 = /4x4|4wd|四驱/.test(vehicleRequired);
  const userIs2wd = explicitVehicleType === '2WD';

  const labelWithFixTypes = (base: string, fixed: boolean, impact?: string, fixedTypes?: string[]): string => {
    const fx =
      fixedTypes && fixedTypes.length > 0
        ? `｜效果: 解决${fixedTypes.map((t) => `【${t}】`).join('')}冲突`
        : '';
    return `${base}（${fixed ? 'high_probability_fixed' : 'needs_more_changes'}）${impact ? `｜Impact: ${impact}` : ''}${fx}`;
  };

  const clone = <T,>(v: T): T => {
    const sc = (globalThis as any).structuredClone as ((x: any) => any) | undefined;
    if (typeof sc === 'function') return sc(v);
    return JSON.parse(JSON.stringify(v)) as T;
  };

  const baseViolations = ((decisionState as any).constraints?.violations ??
    (state.gate_result as any)?.violations ??
    []) as Array<{ type?: string }>;
  const baseVTypes = new Set(baseViolations.map((v) => String(v?.type ?? '')).filter(Boolean));
  const baseCount = baseViolations.length;

  const shadowGate = async (
    patchTrip: (t: any) => any,
  ): Promise<{ fixed: boolean; improved: boolean; fixedTypes: string[]; afterCount: number; afterTypes: string[] }> => {
    if (!decisionKernel || !decisionState) {
      return {
        fixed: false,
        improved: false,
        fixedTypes: [],
        afterCount: baseCount,
        afterTypes: Array.from(baseVTypes),
      };
    }
    const shadowDso = clone(decisionState);
    const shadowTrip = patchTrip(
      clone(state.trip_plan_request ?? { request_id: state.request_id, origin: '', destination: '' }),
    );
    const ctx = {
      requestId: state.request_id,
      routeDirectionId: (request as any).route_direction_id ?? undefined,
      userId: (request as any).user_id,
      tripPlanRequest: shadowTrip,
      researchData: state.research_data,
    };
    const { gateResult } = await decisionKernel.executeGateEval(shadowDso as any, ctx as any);
    const vs = (gateResult.violations ?? []) as Array<{ type?: string }>;
    const afterTypes = vs.map((v) => String(v?.type ?? '')).filter(Boolean);
    const afterSet = new Set(afterTypes);
    const fixedTypes = Array.from(baseVTypes)
      .filter((t) => !afterSet.has(t))
      .map((t) => host.violationTypeToCn(t));
    const afterCount = vs.length;
    const fixed = afterCount === 0;
    const improved = afterCount < baseCount;
    return { fixed, improved, fixedTypes, afterCount, afterTypes };
  };

  const optA = (() => {
    if (!Array.isArray(mustInclude) || mustInclude.length === 0 || typeof days !== 'number' || !Number.isFinite(days)) {
      return undefined;
    }
    const fixed = mustInclude.length <= Math.max(1, Math.floor(days) + 1);
    return {
      value: 'increase_days_by_1',
      label: labelWithFixTypes(
        `将总天数增加 1 天（${days}→${days + 1}）以容纳必去点`,
        fixed,
        `近似将必去点容量上限从 ${Math.max(1, Math.floor(days) + 1)} 提升到 ${Math.max(1, Math.floor(days + 1) + 1)}`,
      ),
    };
  })();

  const optB = (() => {
    if (!Array.isArray(mustInclude) || mustInclude.length === 0) return undefined;
    const fixed = typeof days === 'number' ? mustInclude.length - 1 <= Math.max(1, Math.floor(days)) : true;
    return {
      value: 'drop_one_must_include_poi',
      label: labelWithFixTypes(
        '移除 1 个必去点（最小冲突集近似）',
        fixed,
        `必去点数量从 ${mustInclude.length} 降至 ${Math.max(0, mustInclude.length - 1)}`,
      ),
    };
  })();

  const optC = (() => {
    if (!need4x4) return undefined;
    const fixed = true;
    return {
      value: 'upgrade_vehicle_to_4wd',
      label: labelWithFixTypes(
        '将车辆能力升级为 4WD/4x4（满足 F-road 准入）',
        fixed && userIs2wd,
        vehicleRequiredRaw ? `满足车辆要求：${String(vehicleRequiredRaw)}` : undefined,
      ),
    };
  })();

  const optionsBase = [optC, optA, optB].filter(Boolean) as Array<{ value: string; label: string }>;

  const dryRunResults = await Promise.all(
    optionsBase.map(async (o) => {
      const r = await shadowGate((t) => {
        const next = { ...t, constraints: { ...(t.constraints ?? {}) } } as any;
        if (o.value === 'upgrade_vehicle_to_4wd') next.constraints.vehicle_type = '4WD';
        if (o.value === 'increase_days_by_1') {
          if (next.date_range?.end_date) {
            const end = new Date(next.date_range.end_date + 'T00:00:00Z');
            if (!Number.isNaN(end.getTime())) {
              const plus = new Date(end);
              plus.setUTCDate(plus.getUTCDate() + 1);
              next.date_range = { ...next.date_range, end_date: plus.toISOString().slice(0, 10) };
            }
          } else if (typeof next.days === 'number' && Number.isFinite(next.days)) {
            next.days = Math.max(1, Math.floor(next.days) + 1);
          }
        }
        if (o.value === 'drop_one_must_include_poi') {
          const arr = Array.isArray(next.must_include_poi_ids) ? [...next.must_include_poi_ids] : [];
          if (arr.length > 0) arr.pop();
          next.must_include_poi_ids = arr;
        }
        return next;
      });
      const fixed = r.fixed;
      const improved = r.improved;
      const fixedTypes = r.fixedTypes;
      const scoreLabel = fixed
        ? 'high_probability_fixed'
        : improved
          ? `needs_more_changes（improved ${baseCount}→${r.afterCount}）`
          : 'needs_more_changes';
      const enrichedLabel =
        `${o.label}`.replace(/\（(high_probability_fixed|needs_more_changes)\）/, `（${scoreLabel}）`) +
        (fixedTypes.length ? `｜效果: 解决${fixedTypes.map((t) => `【${t}】`).join('')}冲突` : '');
      return { value: o.value, label: enrichedLabel, fixed };
    }),
  );

  const anyHigh = dryRunResults.some((r) => r.label.includes('high_probability_fixed'));
  const sameAttempts = decisionState?.systemState?.consecutiveSameRelaxationAttempts ?? 0;
  const recommendTermination = sameAttempts >= 2;
  const dominant_cid =
    String((decisionState as any)?.constraints?.violations?.[0]?.type ?? '').trim() ||
    (need4x4 ? 'REACHABILITY_HARD' : mustInclude?.length ? 'SCOPE' : 'MIXED');
  const is_hard = need4x4 || String((baseViolations?.[0] as any)?.severity ?? '').toUpperCase() === 'HARD';
  const ewMetaTop = (state.metadata as any)?.early_warning?.historical_precedents?.[0] as any | undefined;

  const scored = dryRunResults.map(({ value, label }) => {
    const id = value as RelaxationActionId;
      const persuasion = host.getLocalCaseStore()?.getPersuasionRate({
      signature: SignatureBuilder.buildConversionSignature({
        conflict_type: (need4x4 ? 'REACHABILITY' : mustInclude?.length ? 'SCOPE' : 'MIXED') as any,
        primary_violation_type: dominant_cid,
        region_id: (state.trip_plan_request as any)?.region_id,
        start_date:
          (state.trip_plan_request as any)?.start_date ?? state.trip_plan_request?.date_range?.start_date,
      }),
      action: id,
    });
    const breakdown = ConstraintScorer.calculateScore(id, {
      dominant_cid,
      is_hard,
      oscillation_k: sameAttempts,
      precedent: ewMetaTop,
      preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
      persuasion,
      delta: 1.5,
    });
    return { value: id, label, breakdown };
  });
  scored.sort((a, b) => b.breakdown.score - a.breakdown.score);

  const grouped = groupMinCutPaths({ dominant_cid, is_hard, options: scored });
  const decorate = (prefix: string, o: (typeof scored)[number]) => ({
    value: o.value,
    label: `${prefix}${o.label}${
      o.breakdown.precedent_n > 3 && typeof ewMetaTop?.stats?.historical_late_accept_rate === 'number'
        ? `｜判例: N=${o.breakdown.precedent_n}, ${(ewMetaTop.stats.historical_late_accept_rate * 100).toFixed(0)}% 最终采纳`
        : o.breakdown.precedent_n >= 1
          ? `｜判例: N=${o.breakdown.precedent_n}`
          : ''
    }`,
    metadata: {
      score: o.breakdown.score,
      weights: o.breakdown.weights,
      dominant_cid: o.breakdown.dominant_cid,
      precedent_n: o.breakdown.precedent_n,
      terms: o.breakdown.terms,
      path: prefix.includes('路径 A') ? 'A' : prefix.includes('路径 B') ? 'B' : 'OTHER',
    },
  });

  const options = [
    ...grouped.pathA.map((o) => decorate('【路径 A·推荐】', o)),
    ...grouped.pathB.map((o) => decorate('【路径 B·可选】', o)),
    ...grouped.other.map((o) => decorate('【可选】', o)),
    {
      value: 'accept_no_solution',
      label: `${recommendTermination ? '【推荐】' : ''}保持所有约束不变（TERMINAL_NO_SOLUTION｜CONSENSUS_REACHED: NO_FEASIBLE_PATH）${
        recommendTermination ? '（已连续多次尝试当前约束，物理冲突仍无法消除）' : ''
      }`,
      metadata: {
        score: ConstraintScorer.calculateScore('accept_no_solution', {
          dominant_cid,
          is_hard,
          oscillation_k: sameAttempts,
          precedent: ewMetaTop,
          preset: is_hard ? 'ICELAND_HARD' : 'SOFT_PREFERENCE',
        }).score,
        dominant_cid,
        precedent_n: typeof ewMetaTop?.sample_count === 'number' ? ewMetaTop.sample_count : 0,
        path: 'OTHER',
      },
    },
  ] as any;

  state.errors.push({
    step: 'PLAN_GEN',
    error_code: planGenTf.code,
    message: planGenTf.message,
    timestamp: new Date().toISOString(),
  });
  state.clarification_questions = [
    {
      id: 'plan_gen_empty_draft_relax_constraints',
      question: `${
        recommendTermination
          ? `[SYSTEM_ACTION]: 观察到多次尝试未果（连续相同放宽尝试次数=${sameAttempts}）。建议保持当前约束终止规划，或尝试更高强度的组合放宽。\n\n`
          : ''
      }${planGenTf.message} 系统已停止后续验证与行程叙述，以免产生无依据建议。请选择一个“放宽约束”的动作（已做影子预演/近似检查并标注置信度）。`,
      type: anyHigh ? 'single_choice' : 'multi_choice',
      required: true,
      options:
        options.length > 0
          ? options
          : [
              {
                value: 'manual_relax_constraints',
                label: labelWithFixTypes('手动描述你愿意放宽的约束（改期/减少必去点/降低强度）', false),
              },
            ],
      hint: planGenTf.detail ? `技术详情：${planGenTf.detail}` : undefined,
    },
  ];
  state.decision_log.push({
    request_id: state.request_id,
    step: 'PLAN_GEN',
    actor: 'Orchestrator',
    inputs_summary: 'PLAN_GEN_EMPTY_DRAFT → clarification options snapshot',
    outputs_summary: `PLAN_GEN_EMPTY_DRAFT_CLARIFICATION: options=${Array.isArray(options) ? options.length : 0}`,
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: {
      system_action: 'PLAN_GEN_EMPTY_DRAFT_CLARIFICATION',
      options_snapshot: options ?? [],
      dominant_cid,
      is_hard,
    },
  });
  state.current_step = 'DONE';
  state.metadata.last_updated_at = new Date().toISOString();
  state.metadata.total_duration_ms = Date.now() - startTime;
  host.maybeSnapshot(state, 'CHECKPOINT');
  return host.buildClarificationResult(state, startTime, decisionState, context);
}
