import type { ConflictDto, ConflictsResponseDto } from '../../dto/trip-conflicts.dto';
import { ConflictSeverity, ConflictType } from '../../dto/trip-conflicts.dto';
import type {
  PlanningDecisionOption,
  PlanningDecisionOptionKind,
  PlanningDiagnostic,
  PlanningDecisionPack,
} from '../types/planning-decision-pack.types';
import type { PlanProposal } from '../types/plan-proposal.types';
import {
  buildPlanningDecisionPack,
} from './plan-proposal-decision-projection.util';
import { enrichDecisionPackSolutionCards } from './plan-option-solution-card.util';

export { buildExecutionSteps } from './plan-proposal-decision-projection.util';

function conflictTypeToDiagnosticCode(type: ConflictType): string {
  const map: Partial<Record<ConflictType, string>> = {
    [ConflictType.TIME_CONFLICT]: 'overlap_time',
    [ConflictType.DUPLICATE_ITEM]: 'duplicate_place',
    [ConflictType.MAX_DAILY_DRIVE_EXCEEDED]: 'drive_excess',
    [ConflictType.TRANSPORT_TOO_LONG]: 'drive_excess',
    [ConflictType.TRANSPORT_INSUFFICIENT]: 'drive_excess',
    [ConflictType.FATIGUE_EXCEEDED]: 'intensity_high',
    [ConflictType.LUNCH_MISSING]: 'gap_underfill',
    [ConflictType.DINNER_MISSING]: 'gap_underfill',
    [ConflictType.NO_NIGHT_DRIVE_VIOLATION]: 'late_end_time',
    [ConflictType.BUFFER_INSUFFICIENT]: 'overlap_time',
    [ConflictType.CLOSURE_RISK]: 'locked_item',
  };
  return map[type] ?? 'gap_underfill';
}

function conflictTypeToClusterId(type: ConflictType): string {
  switch (type) {
    case ConflictType.TIME_CONFLICT:
    case ConflictType.DUPLICATE_ITEM:
    case ConflictType.BUFFER_INSUFFICIENT:
    case ConflictType.CLOSURE_RISK:
      return 'schedule_conflicts';
    case ConflictType.MAX_DAILY_DRIVE_EXCEEDED:
    case ConflictType.TRANSPORT_TOO_LONG:
    case ConflictType.TRANSPORT_INSUFFICIENT:
    case ConflictType.FATIGUE_EXCEEDED:
    case ConflictType.NO_NIGHT_DRIVE_VIOLATION:
      return 'pacing_timing';
    case ConflictType.LUNCH_MISSING:
    case ConflictType.DINNER_MISSING:
      return 'candidate_placement';
    default:
      return 'pacing_timing';
  }
}

function severityToDiagnostic(
  severity: ConflictSeverity,
): PlanningDiagnostic['severity'] {
  if (severity === ConflictSeverity.HIGH) return 'block';
  if (severity === ConflictSeverity.MEDIUM) return 'warn';
  return 'info';
}

function inferOptionKind(action: string, description: string): PlanningDecisionOptionKind {
  const text = `${action} ${description}`.toLowerCase();
  if (/缩短|shorten|减少停留|dwell/i.test(text)) return 'SHORTEN_STAY';
  if (/提前|earlier|shift.*earl/i.test(text)) return 'SHIFT_EARLIER';
  if (/延后|推迟|later|shift.*lat/i.test(text)) return 'SHIFT_LATER';
  return 'ACCEPT_RISK';
}

function parseDayIndex(conflict: ConflictDto): number | undefined {
  if (conflict.fromDayNumber != null) return conflict.fromDayNumber;
  const day = conflict.affectedDays?.[0];
  if (!day) return undefined;
  const match = day.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

export function diagnosticsFromTripConflicts(
  conflicts: ConflictDto[],
  startSeq: number,
): PlanningDiagnostic[] {
  const diagnostics: PlanningDiagnostic[] = [];
  let seq = startSeq;

  for (const conflict of conflicts.slice(0, 14)) {
    diagnostics.push({
      id: `diag_tc_${seq += 1}`,
      code: conflictTypeToDiagnosticCode(conflict.type),
      message: conflict.description || conflict.title,
      severity: severityToDiagnostic(conflict.severity),
      dayIndex: parseDayIndex(conflict),
      clusterId: conflictTypeToClusterId(conflict.type),
    });
  }

  return diagnostics;
}

export function optionsFromTripConflicts(
  conflicts: ConflictDto[],
  proposal: PlanProposal,
): PlanningDecisionOption[] {
  const options: PlanningDecisionOption[] = [];
  let idx = 0;

  for (const conflict of conflicts) {
    for (const suggestion of conflict.suggestions ?? []) {
      idx += 1;
      const dayIndex = parseDayIndex(conflict);
      options.push({
        id: `repair_opt_${conflict.id}_${idx}`,
        optionKind: inferOptionKind(suggestion.action, suggestion.description),
        title: suggestion.description || conflict.title,
        recommended: conflict.severity === ConflictSeverity.HIGH && idx === 1,
        outcomes: [suggestion.impact || '缓解当前冲突'].filter(Boolean),
        costs: [conflict.title],
        impactScope: {
          scope: dayIndex != null ? 'DAY' : 'TRIP',
          affectedDays: dayIndex != null ? [dayIndex] : [],
          itemIds: conflict.affectedItemIds ?? [],
          candidateIds: [],
          placeIds: [],
        },
        counterfactualRows: [
          {
            id: `cf_tc_${conflict.id}`,
            label: conflict.title,
            dayIndex,
            before: '（当前行程 — 存在冲突）',
            after: suggestion.description,
            itemId: conflict.affectedItemIds?.[0],
          },
        ],
        action: {
          type: 'copilot_action',
          payload: {
            source: 'trip_conflicts',
            conflictId: conflict.id,
            suggestionAction: suggestion.action,
            proposalId: proposal.proposalId,
          },
        },
      });
    }
  }

  return options.slice(0, 5);
}

export function enrichDecisionPackWithTripConflicts(
  pack: PlanningDecisionPack,
  conflictsResponse: ConflictsResponseDto | null,
  proposal: PlanProposal,
): PlanningDecisionPack {
  if (!conflictsResponse?.conflicts?.length) {
    return pack;
  }

  const relevant = conflictsResponse.conflicts.filter((c) => {
    if (!proposal.affectedDays.length) return true;
    const day = parseDayIndex(c);
    return day == null || proposal.affectedDays.includes(day);
  });

  const extraDiagnostics = diagnosticsFromTripConflicts(relevant, pack.diagnostics.length);
  const mergedDiagnostics = [...pack.diagnostics, ...extraDiagnostics].slice(0, 14);

  const repairOptions = optionsFromTripConflicts(relevant, proposal);
  const mergedOptions = [...pack.options];
  for (const opt of repairOptions) {
    if (!mergedOptions.some((o) => o.id === opt.id)) {
      mergedOptions.push(opt);
    }
  }

  const rebuilt = buildPlanningDecisionPack({
    ...proposal,
    validation: {
      ...proposal.validation,
      warnings: [
        ...proposal.validation.warnings,
        ...relevant
          .filter((c) => c.severity !== ConflictSeverity.LOW)
          .map((c) => `[行程冲突] ${c.title}`),
      ],
    },
    tradeoffs: proposal.tradeoffs,
  });

  return enrichDecisionPackSolutionCards(
    {
      ...rebuilt,
      diagnostics: mergedDiagnostics,
      options: mergedOptions,
      decisionClusters: rebuilt.decisionClusters.map((cluster) => {
        const clusterRepairOpts = repairOptions.filter((o) =>
          cluster.id === 'schedule_conflicts' || cluster.id === 'pacing_timing'
            ? o.impactScope.affectedDays.some((d) => cluster.diagnostics.some((diag) => diag.dayIndex === d)) ||
              cluster.diagnostics.some((d) => d.code.startsWith('drive') || d.code.startsWith('overlap'))
            : false,
        );
        if (clusterRepairOpts.length === 0) return cluster;
        return {
          ...cluster,
          options: [...cluster.options, ...clusterRepairOpts].slice(0, 4),
        };
      }),
      monitor: pack.monitor,
    },
    proposal,
  );
}
