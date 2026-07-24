/**
 * P1：actionId → 约束变更映射（版本化 SSOT）
 * @see docs/api/relaxation-suggestions-bff-contract.md
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import type {
  RelaxationSuggestionDto,
  RelaxationSuggestionsContextDto,
} from './relaxation-suggestion-bff.projection.util';
import { RELAXATION_ACTION_DISPLAY_ZH } from './relaxation-suggestion-bff.projection.util';

export const RELAXATION_WRITABLE_PERSIST_ACTION_IDS = new Set([
  'upgrade_vehicle_to_4wd',
  'increase_days_by_1',
  'drop_one_must_include_poi',
  'relax_budget_by_10pct',
  'relax_pace_to_conservative',
  'reduce_scope',
]);

export const RELAXATION_CONSTRAINT_WRITE_SCHEMA = 'tripnara.relaxation_constraint_write@v1' as const;

export type RelaxationConstraintPatch = {
  schema: typeof RELAXATION_CONSTRAINT_WRITE_SCHEMA;
  actionId: string;
  tripPlanRequestPatch?: Partial<TripPlanRequest> & {
    constraints?: Record<string, unknown>;
  };
  constraintsSummaryPatch?: {
    budget?: { total?: number; delta?: number };
    transport?: { travelMode?: string; vehicleType?: '2WD' | '4WD' };
    timeRange?: { extraDays?: number };
  };
  constraintIds?: string[];
};

export const RELAXATION_ACTION_CONSTRAINT_MAP: Record<
  string,
  Omit<RelaxationConstraintPatch, 'schema' | 'actionId'>
> = {
  upgrade_vehicle_to_4wd: {
    constraintIds: ['terrain.f_road_compatibility', 'transport.vehicle_type'],
    tripPlanRequestPatch: { constraints: { vehicle_type: '4WD' } },
    constraintsSummaryPatch: { transport: { vehicleType: '4WD' } },
  },
  increase_days_by_1: {
    constraintIds: ['time_space.eta_feasibility', 'time_range.day_count'],
    constraintsSummaryPatch: { timeRange: { extraDays: 1 } },
  },
  drop_one_must_include_poi: {
    constraintIds: ['scope.must_include_poi'],
  },
  proceed_at_own_risk: {
    constraintIds: ['admissibility.user_acknowledged_risk'],
  },
  accept_no_solution: {
    constraintIds: ['plan_gen.terminal_no_solution'],
  },
  manual_relax_constraints: {
    constraintIds: ['constraints.manual_relax'],
  },
  reduce_scope: {
    constraintIds: ['scope.reduce'],
    constraintsSummaryPatch: { timeRange: { extraDays: -1 } },
  },
  relax_budget_by_10pct: {
    constraintIds: ['budget.total'],
    constraintsSummaryPatch: { budget: { delta: 0.1 } },
  },
  relax_pace_to_conservative: {
    constraintIds: ['pace.mode'],
    tripPlanRequestPatch: { constraints: { pacing_mode: 'conservative' } },
  },
};

export function resolveRelaxationConstraintPatch(actionId: string): RelaxationConstraintPatch | undefined {
  const base = RELAXATION_ACTION_CONSTRAINT_MAP[actionId];
  if (!base) return undefined;
  return { schema: RELAXATION_CONSTRAINT_WRITE_SCHEMA, actionId, ...base };
}

export function applyRelaxationPatchToTripPlanRequest(
  base: TripPlanRequest,
  actionId: string,
): { next: TripPlanRequest; patch?: RelaxationConstraintPatch } {
  const patch = resolveRelaxationConstraintPatch(actionId);
  if (!patch?.tripPlanRequestPatch && actionId !== 'increase_days_by_1' && actionId !== 'drop_one_must_include_poi') {
    return { next: base, patch };
  }

  const next: TripPlanRequest = JSON.parse(JSON.stringify(base)) as TripPlanRequest;
  const tp = patch?.tripPlanRequestPatch;

  if (tp?.constraints) {
    next.constraints = { ...(next.constraints ?? {}), ...tp.constraints };
  }
  if (actionId === 'increase_days_by_1') {
    if (next.date_range?.end_date) {
      const end = new Date(`${next.date_range.end_date}T00:00:00Z`);
      if (!Number.isNaN(end.getTime())) {
        end.setUTCDate(end.getUTCDate() + 1);
        next.date_range = { ...next.date_range, end_date: end.toISOString().slice(0, 10) };
      }
    } else if (typeof next.days === 'number') {
      next.days = Math.max(1, Math.floor(next.days) + 1);
    }
  }
  if (actionId === 'drop_one_must_include_poi') {
    const must = Array.isArray(next.must_include_poi_ids) ? [...next.must_include_poi_ids] : [];
    if (must.length > 0) {
      must.pop();
      next.must_include_poi_ids = must;
    }
  }

  return { next, patch };
}

export function buildRelaxationSuggestionsFromViolations(input: {
  questionId:
    | 'gate_eval_relax_constraints'
    | 'verify_relax_constraints'
    | 'planning_conflicts_relax_constraints';
  violations: Array<{ type?: string; detail?: string; severity?: string }>;
  headlineZh: string;
  conflictType?: 'REACHABILITY' | 'SCOPE' | 'MIXED';
  selectionMode?: 'single' | 'multi';
}): { suggestions: RelaxationSuggestionDto[]; context: RelaxationSuggestionsContextDto } {
  const vTypes = new Set(input.violations.map((v) => String(v.type ?? '').toLowerCase()));
  const suggestions: RelaxationSuggestionDto[] = [];

  const push = (
    actionId: string,
    descriptionZh: string,
    extra?: { constraint_id?: string; recommended?: boolean },
  ) => {
    const preset = RELAXATION_ACTION_DISPLAY_ZH[actionId];
    if (!preset) return;
    suggestions.push({
      schema: 'tripnara.relaxation_suggestion@v1',
      actionId,
      labelZh: preset.labelZh,
      descriptionZh,
      kind: preset.kind,
      ...(extra?.recommended ? { recommended: true } : {}),
      metadata: {
        ...(extra?.constraint_id ? { constraint_id: extra.constraint_id } : {}),
        fixed_conflict_types: [...vTypes].slice(0, 5),
        violations_before: input.violations.length,
      },
    });
  };

  if (
    vTypes.has('reachability') ||
    vTypes.has('terrain') ||
    vTypes.has('vehicle') ||
    input.conflictType === 'REACHABILITY'
  ) {
    push('upgrade_vehicle_to_4wd', '升级四驱以满足 F 路/高地可达性要求', {
      constraint_id: 'terrain.f_road_compatibility',
      recommended: true,
    });
  }
  if (vTypes.has('scope') || vTypes.has('pace') || vTypes.has('time') || input.conflictType === 'SCOPE') {
    push('increase_days_by_1', '增加 1 天以容纳必去点或缓冲', {
      constraint_id: 'time_range.day_count',
    });
    push('drop_one_must_include_poi', '移除 1 个必去点以降低行程密度', {
      constraint_id: 'scope.must_include_poi',
    });
  }
  if (vTypes.has('budget') || vTypes.has('cost')) {
    push('relax_budget_by_10pct', '预算放宽 10% 以解锁更多可行组合', {
      constraint_id: 'budget.total',
      recommended: true,
    });
  }
  if (vTypes.has('fatigue') || vTypes.has('pace_overload')) {
    push('relax_pace_to_conservative', '切换为保守节奏，降低单日强度', {
      constraint_id: 'pace.mode',
      recommended: suggestions.length === 0,
    });
  }

  if (suggestions.length === 0) {
    push('manual_relax_constraints', '手动说明您愿意放宽的约束（日期/预算/强度）', {
      recommended: true,
    });
  } else if (!suggestions.some((s) => s.recommended)) {
    suggestions[0] = { ...suggestions[0], recommended: true };
  }

  return {
    suggestions,
    context: {
      schema: 'tripnara.relaxation_suggestions@v1',
      questionId: input.questionId,
      selectionMode: input.selectionMode ?? (suggestions.length === 1 ? 'single' : 'multi'),
      headlineZh: input.headlineZh,
      conflictType: input.conflictType,
      failureProbHintZh:
        input.violations.length > 0
          ? `检测到 ${input.violations.length} 项约束冲突，请选择一项修复后再继续规划。`
          : undefined,
    },
  };
}
