/**
 * Gate RULE_ENGINE options → feasibility applyRepair / validate bridge (P1).
 */

import type { RepairOption } from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { DecisionProblemDetail } from '../types/decision-semantics.types';

export type GateRepairPlan =
  | { kind: 'feasibility_apply'; issue: FeasibilityIssueDto; optionId: string }
  | { kind: 'validate_trip' }
  | null;

interface GateApplySpec {
  issueKinds: RegExp[];
  optionIdPatterns: RegExp[];
  actionPatterns: RegExp[];
}

const GATE_APPLY_SPECS: Record<string, GateApplySpec> = {
  gate_reach_alt_route: {
    issueKinds: [/route|reach|access|travel|transport|visitor|road/i],
    optionIdPatterns: [/alt|bypass|alternative|change_route|find_alternative/i],
    actionPatterns: [/alternative_route|change_route|find_alternative|bypass/i],
  },
  gate_reach_split_leg: {
    issueKinds: [/drive|travel|distance|pace|segment|inter_day|daily/i],
    optionIdPatterns: [/insert_rest|split|buffer|rest_day|add_buffer/i],
    actionPatterns: [/insert_rest|add_buffer|split_day|split_journey/i],
  },
  gate_reach_change_mode: {
    issueKinds: [/transport|travel|route|reach/i],
    optionIdPatterns: [/transport|mode|change_mode/i],
    actionPatterns: [/transport|change_mode|change_transport/i],
  },
  gate_safety_shift_date: {
    issueKinds: [/drive|travel|schedule|time|safety|solar/i],
    optionIdPatterns: [/move_to_day|shift_date|change_date|reorder/i],
    actionPatterns: [/move_to_day|change_date|shift_date|reorder/i],
  },
  gate_safety_alt_activity: {
    issueKinds: [/access|visitor|poi|activity|safety/i],
    optionIdPatterns: [/replace|alternative|plan_b|alt_poi/i],
    actionPatterns: [/replace|alternative|plan_b/i],
  },
  gate_safety_cancel: {
    issueKinds: [/route|access|travel|safety|activity/i],
    optionIdPatterns: [/remove|skip|cancel|delete|drop/i],
    actionPatterns: [/remove|skip|cancel|delete/i],
  },
  gate_dem_alt_route: {
    issueKinds: [/route|dem|terrain|safety|travel/i],
    optionIdPatterns: [/alt|alternative|change_route|bypass/i],
    actionPatterns: [/alternative_route|change_route/i],
  },
  gate_dem_vehicle_adjust: {
    issueKinds: [/route|dem|vehicle|transport|travel/i],
    optionIdPatterns: [/vehicle|transport|4wd|mode/i],
    actionPatterns: [/vehicle|transport|change_mode/i],
  },
  gate_dem_cancel_segment: {
    issueKinds: [/route|dem|travel|segment/i],
    optionIdPatterns: [/remove|skip|cancel|delete/i],
    actionPatterns: [/remove|skip|cancel/i],
  },
};

export function isGateOptionId(optionId: string): boolean {
  return optionId.startsWith('gate_');
}

export function isGateValidateOption(optionId: string): boolean {
  return optionId === 'gate_data_revalidate';
}

function affectedDaysForProblem(detail: DecisionProblemDetail): number[] {
  const fromScope = detail.affectedScope
    .filter((s) => s.scopeType === 'DAY')
    .map((s) => Number(s.scopeId))
    .filter((n) => Number.isFinite(n));
  return fromScope;
}

function issueOverlapsDays(issue: FeasibilityIssueDto, days: number[]): boolean {
  if (!days.length) return true;
  const issueDays = issue.affectedDays ?? [];
  if (!issueDays.length) return true;
  return issueDays.some((d) => days.includes(d));
}

function issueMatchesSpec(issue: FeasibilityIssueDto, spec: GateApplySpec): boolean {
  const blob = `${issue.issueKind ?? ''} ${issue.category} ${issue.message} ${issue.title}`;
  return spec.issueKinds.some((re) => re.test(blob));
}

function repairOptionMatchesSpec(option: Pick<RepairOption, 'id' | 'actionType'>, spec: GateApplySpec): boolean {
  const blob = `${option.id} ${option.actionType ?? ''}`;
  return (
    spec.optionIdPatterns.some((re) => re.test(option.id)) ||
    spec.actionPatterns.some((re) => re.test(option.actionType ?? ''))
  );
}

function embeddedOptionsMatch(issue: FeasibilityIssueDto, spec: GateApplySpec): string | undefined {
  for (const embedded of issue.repairOptions ?? []) {
    const candidate = {
      id: embedded.id,
      actionType: embedded.actionType ?? embedded.type,
    };
    if (repairOptionMatchesSpec(candidate, spec)) {
      return embedded.id;
    }
  }
  return undefined;
}

export function planGateRepairSync(
  optionId: string,
  detail: DecisionProblemDetail,
  issues: FeasibilityIssueDto[],
): GateRepairPlan {
  if (isGateValidateOption(optionId)) {
    return { kind: 'validate_trip' };
  }

  const spec = GATE_APPLY_SPECS[optionId];
  if (!spec) return null;

  const days = affectedDaysForProblem(detail);
  const ranked = issues
    .filter((issue) => issueOverlapsDays(issue, days))
    .filter((issue) => issueMatchesSpec(issue, spec));

  for (const issue of ranked) {
    const embeddedId = embeddedOptionsMatch(issue, spec);
    if (embeddedId) {
      return { kind: 'feasibility_apply', issue, optionId: embeddedId };
    }
  }

  return null;
}

export async function planGateRepairAsync(input: {
  optionId: string;
  detail: DecisionProblemDetail;
  issues: FeasibilityIssueDto[];
  loadRepairOptions: (issueId: string) => Promise<RepairOption[]>;
}): Promise<GateRepairPlan> {
  const syncPlan = planGateRepairSync(input.optionId, input.detail, input.issues);
  if (syncPlan?.kind === 'validate_trip') return syncPlan;
  if (syncPlan?.kind === 'feasibility_apply') return syncPlan;

  const spec = GATE_APPLY_SPECS[input.optionId];
  if (!spec) return null;

  const days = affectedDaysForProblem(input.detail);
  const candidates = input.issues
    .filter((issue) => issueOverlapsDays(issue, days))
    .filter((issue) => issueMatchesSpec(issue, spec));

  for (const issue of candidates) {
    const options = await input.loadRepairOptions(issue.id);
    const matched = options.find((o) => repairOptionMatchesSpec(o, spec));
    if (matched) {
      return { kind: 'feasibility_apply', issue, optionId: matched.id };
    }
  }

  return null;
}

export function canPlanGateRepair(
  optionId: string,
  detail: DecisionProblemDetail,
  issues: FeasibilityIssueDto[],
): boolean {
  return planGateRepairSync(optionId, detail, issues) !== null;
}
