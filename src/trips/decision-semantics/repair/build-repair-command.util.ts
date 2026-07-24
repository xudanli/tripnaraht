/**
 * P1 — derive RepairCommand + executionCapability from DecisionOption context.
 */

import type { RepairOption } from '../../readiness/types/coverage-map.types';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  DecisionOption,
  DecisionOptionSource,
  DecisionProblemDetail,
  EntityReference,
  ExecutionCapability,
  RepairCommand,
  RepairCommandType,
} from '../types/decision-semantics.types';

const GATE_OPTION_COMMAND: Record<string, RepairCommandType> = {
  gate_reach_alt_route: 'CHANGE_ROUTE',
  gate_reach_split_leg: 'SPLIT_JOURNEY',
  gate_reach_change_mode: 'CHANGE_TRANSPORT_MODE',
  gate_safety_shift_date: 'CHANGE_DATE',
  gate_safety_alt_activity: 'REPLACE_POI',
  gate_safety_cancel: 'REMOVE_ITEM',
  gate_data_attach_evidence: 'ATTACH_EVIDENCE',
  gate_data_revalidate: 'REVALIDATE_FEASIBILITY',
  gate_dem_alt_route: 'CHANGE_ROUTE',
  gate_dem_vehicle_adjust: 'CHANGE_TRANSPORT_MODE',
  gate_dem_cancel_segment: 'REMOVE_ITEM',
};

function actionToCommandType(action?: string, optionId?: string): RepairCommandType | undefined {
  const blob = `${action ?? ''} ${optionId ?? ''}`.toLowerCase();
  if (GATE_OPTION_COMMAND[optionId ?? '']) {
    return GATE_OPTION_COMMAND[optionId!];
  }
  if (/insert_rest|add_buffer|buffer|rest_day/.test(blob)) return 'ADD_BUFFER';
  if (/relocate_lodging|change_hotel|midpoint|hotel/.test(blob)) return 'CHANGE_HOTEL';
  if (/move_to_day|split_day|split_journey|split_leg/.test(blob)) return 'SPLIT_JOURNEY';
  if (/alternative_route|change_route|bypass|find_alternative/.test(blob)) return 'CHANGE_ROUTE';
  if (/shift_departure|move_item|reorder/.test(blob)) return 'MOVE_ITEM';
  if (/replace_poi|replace/.test(blob)) return 'REPLACE_POI';
  if (/remove|skip|delete|drop_poi/.test(blob)) return 'REMOVE_ITEM';
  if (/change_date|shift_date/.test(blob)) return 'CHANGE_DATE';
  if (/transport|change_mode/.test(blob)) return 'CHANGE_TRANSPORT_MODE';
  if (/increase_budget|budget/.test(blob)) return undefined;
  if (/attach_evidence|evidence/.test(blob)) return 'ATTACH_EVIDENCE';
  if (/revalidate|validate/.test(blob)) return 'REVALIDATE_FEASIBILITY';
  return undefined;
}

function buildTargetRefs(
  issue: FeasibilityIssueDto | undefined,
  detail: DecisionProblemDetail,
  commandType: RepairCommandType,
): EntityReference[] {
  const refs: EntityReference[] = [];

  if (issue?.fromItemId) {
    refs.push({ entityType: 'ITINERARY_ITEM', entityId: issue.fromItemId, label: 'from item' });
  }
  if (issue?.toItemId) {
    refs.push({ entityType: 'ITINERARY_ITEM', entityId: issue.toItemId, label: 'to item' });
  }

  for (const scope of detail.affectedScope) {
    if (scope.scopeType === 'DAY') {
      refs.push({ entityType: 'DAY', entityId: scope.scopeId, label: `Day ${scope.scopeId}` });
    }
    if (scope.scopeType === 'POI') {
      refs.push({ entityType: 'POI', entityId: scope.scopeId });
    }
    if (scope.scopeType === 'ROUTE_SEGMENT') {
      refs.push({ entityType: 'ROUTE_SEGMENT', entityId: scope.scopeId });
    }
    if (scope.scopeType === 'MEMBER') {
      refs.push({ entityType: 'TRIP', entityId: scope.scopeId, label: scope.scopeId });
    }
  }

  const feasibilityRef = detail.sourceRefs.find((r) => r.system === 'FEASIBILITY');
  if (feasibilityRef) {
    refs.push({ entityType: 'CONSTRAINT', entityId: feasibilityRef.refId, label: issue?.id });
  }

  if (!refs.length) {
    refs.push({
      entityType: commandType === 'CHANGE_ROUTE' ? 'ROUTE_SEGMENT' : 'TRIP',
      entityId: detail.tripId,
      label: detail.title,
    });
  }

  return refs;
}

export function buildRepairCommand(input: {
  optionId: string;
  tripVersion: string;
  detail: DecisionProblemDetail;
  issue?: FeasibilityIssueDto;
  repairOption?: RepairOption;
  optionType?: DecisionOption['type'];
}): RepairCommand | undefined {
  if (input.optionType === 'ACCEPT_RISK' || input.optionId.startsWith('ack_')) {
    return undefined;
  }
  if (input.optionId.startsWith('planb_')) {
    const payload = (input.repairOption?.payload ?? {}) as Record<string, unknown>;
    return {
      commandType: 'REPLACE_POI',
      targetRefs: buildTargetRefs(input.issue, input.detail, 'REPLACE_POI'),
      parameters: {
        planBHint: input.repairOption?.description,
        alternativePoiId: payload.alternativePoiId,
        externalUrl: payload.externalUrl,
        planBAction: payload.planBAction,
      },
      sourceOptionId: input.optionId,
      expectedTripVersion: input.tripVersion,
    };
  }

  const commandType = actionToCommandType(
    input.repairOption?.actionType ?? input.repairOption?.id,
    input.optionId,
  );
  if (!commandType) return undefined;

  const payload = (input.repairOption?.payload ?? {}) as Record<string, unknown>;

  return {
    commandType,
    targetRefs: buildTargetRefs(input.issue, input.detail, commandType),
    parameters: {
      actionType: input.repairOption?.actionType,
      issueId: input.issue?.id,
      issueKind: input.issue?.issueKind,
      affectedDays: input.issue?.affectedDays ?? input.detail.affectedScope
        .filter((s) => s.scopeType === 'DAY')
        .map((s) => Number(s.scopeId))
        .filter((n) => Number.isFinite(n)),
      ...payload,
    },
    sourceOptionId: input.optionId,
    expectedTripVersion: input.tripVersion,
  };
}

export function inferExecutionCapability(input: {
  optionId: string;
  source: DecisionOptionSource;
  executable: boolean;
  optionType: DecisionOption['type'];
  hasFeasibilityIssue: boolean;
  canExecuteRepair: boolean;
  canExecuteGateRepair?: boolean;
  repairCommand?: RepairCommand;
}): ExecutionCapability {
  if (input.optionType === 'ACCEPT_RISK' || input.optionId.startsWith('ack_')) {
    return 'ADVISORY_ONLY';
  }
  if (input.canExecuteGateRepair) {
    return 'DIRECT';
  }
  if (input.repairCommand?.commandType === 'REVALIDATE_FEASIBILITY') {
    return 'GUIDED_MANUAL';
  }
  if (input.repairCommand?.commandType === 'ATTACH_EVIDENCE') {
    return 'GUIDED_MANUAL';
  }
  if (input.canExecuteRepair && input.hasFeasibilityIssue && input.source === 'CONSTRAINT_REPAIR') {
    return 'DIRECT';
  }
  if (input.executable && input.hasFeasibilityIssue && input.repairCommand) {
    return 'PARTIAL';
  }
  if (input.repairCommand && input.source === 'RULE_ENGINE') {
    return 'GUIDED_MANUAL';
  }
  if (input.repairCommand) {
    return input.executable ? 'PARTIAL' : 'GUIDED_MANUAL';
  }
  return 'ADVISORY_ONLY';
}

export function enrichDecisionOptionWithExecution(input: {
  option: DecisionOption;
  tripVersion: string;
  detail: DecisionProblemDetail;
  issue?: FeasibilityIssueDto;
  repairOption?: RepairOption;
  canExecuteRepair: boolean;
  canExecuteGateRepair?: boolean;
}): DecisionOption {
  const repairCommand = buildRepairCommand({
    optionId: input.option.id,
    tripVersion: input.tripVersion,
    detail: input.detail,
    issue: input.issue,
    repairOption: input.repairOption,
    optionType: input.option.type,
  });

  const executionCapability = inferExecutionCapability({
    optionId: input.option.id,
    source: input.option.source,
    executable: input.option.executable,
    optionType: input.option.type,
    hasFeasibilityIssue: Boolean(input.issue),
    canExecuteRepair: input.canExecuteRepair,
    canExecuteGateRepair: input.canExecuteGateRepair,
    repairCommand,
  });

  return {
    ...input.option,
    repairCommand,
    executionCapability,
  };
}
