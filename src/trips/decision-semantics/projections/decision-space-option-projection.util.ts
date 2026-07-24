/**
 * Decision Space option card projection — structured tradeoffs + routePreview (Plan Studio).
 * @see DECISION_SPACE_OPTION_TRADEOFFS.md
 */

import { formatDriveDurationZhLong } from '../../trip-constraint-solver/utils/daily-drive-threshold.util';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { RepairOption } from '../../readiness/types/coverage-map.types';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { DecisionWorkspace } from '../../guardian-decision-core/contracts/decision-workspace.types';
import type { Rfc001RepairCandidate } from '../../guardian-decision-core/contracts/guardian-outputs.types';
import type {
  AffectedScopeDisplay,
  DecisionOption,
  DecisionOptionRoutePreview,
  TradeoffDimension,
  TradeoffDimensionKey,
} from '../types/decision-semantics.types';
import { enrichTradeoffsWithContextualNarratives } from './tradeoff-contextual-narrative.util';

const SPACE_DIMENSION_PRIORITY: TradeoffDimensionKey[] = [
  'FLEXIBILITY',
  'TIME',
  'COST',
  'POI_COVERAGE',
];

export interface DecisionSpaceOptionContext {
  issue?: FeasibilityIssueDto;
  repairOption?: RepairOption;
  affectedScopeDisplay?: AffectedScopeDisplay[];
  /** Canonical L2 — workspace + problem for candidate-level projection */
  workspace?: DecisionWorkspace;
  problem?: Rfc001DecisionProblem;
  candidate?: Rfc001RepairCandidate;
}

function formatDriveDurationHmCompact(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const mins = rounded % 60;
  if (hours > 0 && mins > 0) return `${hours}h${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

function formatTimeComparisonExplanation(beforeMinutes: number, afterMinutes: number): string {
  return `原方案 ${formatDriveDurationHmCompact(beforeMinutes)} → 调整后 ${formatDriveDurationHmCompact(afterMinutes)}`;
}

function estimateLodgingCostDelta(shortfallMinutes: number): number {
  if (shortfallMinutes >= 90) return 620;
  if (shortfallMinutes >= 45) return 420;
  return 280;
}

function readPositiveMinutes(value: unknown): number | undefined {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n);
}

function repairActionType(option?: RepairOption): string {
  return String(option?.actionType ?? '').toLowerCase();
}

function findTradeoff(
  tradeoffs: TradeoffDimension[],
  dimension: TradeoffDimensionKey,
  direction?: TradeoffDimension['direction'],
): TradeoffDimension | undefined {
  return tradeoffs.find(
    (t) => t.dimension === dimension && (direction == null || t.direction === direction),
  );
}

function upsertTradeoff(
  target: TradeoffDimension[],
  row: TradeoffDimension,
): void {
  const idx = target.findIndex((t) => t.dimension === row.dimension);
  if (idx >= 0) {
    target[idx] = { ...target[idx], ...row };
  } else {
    target.push(row);
  }
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(99, Math.round(value)));
}

function savedDriveMinutes(
  tradeoffs: TradeoffDimension[],
  payload?: Record<string, unknown>,
): number | undefined {
  return (
    readPositiveMinutes(payload?.expectedDriveReductionMinutes ?? payload?.savedMinutes) ??
    findTradeoff(tradeoffs, 'FATIGUE', 'IMPROVE')?.value ??
    findTradeoff(tradeoffs, 'TIME', 'IMPROVE')?.value
  );
}

function buildFlexibilityRow(input: {
  savedMinutes?: number;
  shortfallMinutes?: number;
  baselineTravelMinutes?: number;
  loadImprovementRatio?: number;
}): TradeoffDimension | undefined {
  if (input.loadImprovementRatio != null && input.loadImprovementRatio > 0) {
    const value = clampPercent(input.loadImprovementRatio * 100);
    return {
      dimension: 'FLEXIBILITY',
      direction: 'IMPROVE',
      value,
      unit: 'PERCENT',
      explanation: '可行度提升，缓冲更充裕',
    };
  }

  const { savedMinutes, shortfallMinutes, baselineTravelMinutes } = input;
  if (savedMinutes != null && shortfallMinutes != null && shortfallMinutes > 0) {
    return {
      dimension: 'FLEXIBILITY',
      direction: 'IMPROVE',
      value: clampPercent((savedMinutes / shortfallMinutes) * 100),
      unit: 'PERCENT',
      explanation: '可行度提升，缓冲更充裕',
    };
  }

  if (savedMinutes != null && baselineTravelMinutes != null && baselineTravelMinutes > 0) {
    return {
      dimension: 'FLEXIBILITY',
      direction: 'IMPROVE',
      value: clampPercent((savedMinutes / baselineTravelMinutes) * 100),
      unit: 'PERCENT',
      explanation: '可行度提升，缓冲更充裕',
    };
  }

  return undefined;
}

function buildTimeRow(input: {
  baselineTravelMinutes?: number;
  savedMinutes?: number;
  afterTravelMinutes?: number;
  direction?: TradeoffDimension['direction'];
  existing?: TradeoffDimension;
}): TradeoffDimension | undefined {
  let before = input.baselineTravelMinutes;
  let after = input.afterTravelMinutes;

  if (before != null && input.savedMinutes != null) {
    after = Math.max(0, before - input.savedMinutes);
  } else if (input.existing?.unit === 'MINUTE' && typeof input.existing.value === 'number') {
    if (input.existing.direction === 'IMPROVE' && before != null) {
      after = Math.max(0, before - input.existing.value);
    } else if (input.existing.direction === 'WORSEN' && before != null) {
      after = before + input.existing.value;
    } else {
      after = input.existing.value;
    }
  }

  if (after == null) return undefined;

  const direction =
    input.direction ??
    (before != null && after < before
      ? 'IMPROVE'
      : before != null && after > before
        ? 'WORSEN'
        : 'UNCHANGED');

  const explanation =
    before != null && before !== after
      ? formatTimeComparisonExplanation(before, after)
      : input.existing?.explanation ?? '驾驶时长变化';

  return {
    dimension: 'TIME',
    direction,
    value: after,
    unit: 'MINUTE',
    explanation,
  };
}

function buildCostRow(input: {
  amount?: number;
  existing?: TradeoffDimension;
}): TradeoffDimension | undefined {
  const amount = input.amount ?? (input.existing?.unit === 'CURRENCY' ? input.existing.value : undefined);
  if (amount == null || amount <= 0) return undefined;
  return {
    dimension: 'COST',
    direction: input.existing?.direction ?? 'WORSEN',
    value: amount,
    unit: 'CURRENCY',
    explanation: input.existing?.explanation ?? '人均住宿差价',
  };
}

function buildPoiCoverageRow(input: {
  preservationRatio?: number;
  deltaPercent?: number;
  direction?: TradeoffDimension['direction'];
  existing?: TradeoffDimension;
}): TradeoffDimension | undefined {
  if (input.preservationRatio != null) {
    const baselineValue = clampPercent(input.preservationRatio * 100);
    const delta =
      input.deltaPercent ??
      (input.existing?.unit === 'PERCENT' ? input.existing.value : undefined) ??
      0;
    return {
      dimension: 'POI_COVERAGE',
      direction: delta >= 0 ? 'IMPROVE' : 'WORSEN',
      value: Math.abs(delta),
      unit: 'PERCENT',
      baselineValue,
      explanation: input.existing?.explanation ?? '核心 POI 保留率',
    };
  }

  if (input.existing) {
    const row: TradeoffDimension = { ...input.existing, dimension: 'POI_COVERAGE' };
    if (row.unit === 'PERCENT' && typeof row.value === 'number' && row.baselineValue == null) {
      row.baselineValue = clampPercent(90 + row.value);
    }
    return row;
  }

  return undefined;
}

function extractRoutePlaceNames(ctx: DecisionSpaceOptionContext): string[] | undefined {
  const payload = (ctx.repairOption?.payload ?? ctx.candidate?.proposedOperations?.[0]?.parameters ?? {}) as Record<
    string,
    unknown
  >;

  const fromPayload = payload.routePlaceNames ?? payload.placeNames;
  if (Array.isArray(fromPayload)) {
    const names = fromPayload.map(String).filter(Boolean);
    if (names.length >= 2) return names.slice(0, 6);
  }

  const anchors = ctx.issue?.anchors;
  const from = anchors?.fromPlaceLabel ?? (typeof payload.fromPlaceLabel === 'string' ? payload.fromPlaceLabel : undefined);
  const midpoint =
    (typeof payload.suggestedLodgingLabel === 'string' ? payload.suggestedLodgingLabel : undefined) ??
    (typeof payload.midpointLabel === 'string' ? payload.midpointLabel : undefined);
  const to = anchors?.toPlaceLabel ?? (typeof payload.toPlaceLabel === 'string' ? payload.toPlaceLabel : undefined);

  const route = [from, midpoint, to].filter((v): v is string => Boolean(v));
  if (route.length >= 2) return route.slice(0, 6);

  const scopeNames = ctx.affectedScopeDisplay?.flatMap((s) => s.placeNames ?? []).filter(Boolean);
  if (scopeNames && scopeNames.length >= 2) return [...new Set(scopeNames)].slice(0, 6);

  return undefined;
}

function buildLegacySpaceTradeoffs(
  tradeoffs: TradeoffDimension[],
  ctx: DecisionSpaceOptionContext,
): TradeoffDimension[] {
  const issue = ctx.issue;
  const option = ctx.repairOption;
  const payload = (option?.payload ?? {}) as Record<string, unknown>;
  const action = repairActionType(option);

  const baselineTravel = readPositiveMinutes(issue?.anchors?.travelMinutes);
  const shortfall = readPositiveMinutes(issue?.anchors?.shortfallMinutes);
  const saved = savedDriveMinutes(tradeoffs, payload);

  const projected: TradeoffDimension[] = [...tradeoffs];

  if (/relocate_lodging|change_hotel|relocate/.test(action)) {
    const flex = buildFlexibilityRow({ savedMinutes: saved, shortfallMinutes: shortfall, baselineTravelMinutes: baselineTravel });
    if (flex) upsertTradeoff(projected, flex);

    const time = buildTimeRow({ baselineTravelMinutes: baselineTravel, savedMinutes: saved });
    if (time) upsertTradeoff(projected, time);

    const costAmount =
      option?.cost != null && option.cost > 0
        ? option.cost
        : shortfall != null
          ? estimateLodgingCostDelta(shortfall)
          : undefined;
    const cost = buildCostRow({ amount: costAmount, existing: findTradeoff(tradeoffs, 'COST') });
    if (cost) upsertTradeoff(projected, cost);

    upsertTradeoff(
      projected,
      buildPoiCoverageRow({
        preservationRatio: 0.95,
        deltaPercent: 5,
        existing: findTradeoff(tradeoffs, 'POI_COVERAGE'),
      }) ?? {
        dimension: 'POI_COVERAGE',
        direction: 'UNCHANGED',
        value: 0,
        unit: 'PERCENT',
        baselineValue: 95,
        explanation: '核心 POI 保留率',
      },
    );
  } else if (/split_day|split_drive|split_journey|split_leg/.test(action)) {
    const flex = buildFlexibilityRow({ savedMinutes: saved, shortfallMinutes: shortfall, baselineTravelMinutes: baselineTravel }) ?? {
      dimension: 'FLEXIBILITY',
      direction: 'WORSEN',
      explanation: '需调整多日行程分配',
    };
    upsertTradeoff(projected, flex);

    const time = buildTimeRow({
      baselineTravelMinutes: baselineTravel,
      savedMinutes: saved,
      existing: findTradeoff(tradeoffs, 'FATIGUE', 'IMPROVE') ?? findTradeoff(tradeoffs, 'TIME', 'IMPROVE'),
    });
    if (time) upsertTradeoff(projected, time);
  } else if (issue?.issueKind === 'daily_drive' || issue?.category === 'transport') {
    const flex = buildFlexibilityRow({ savedMinutes: saved, shortfallMinutes: shortfall, baselineTravelMinutes: baselineTravel });
    if (flex) upsertTradeoff(projected, flex);

    const time = buildTimeRow({
      baselineTravelMinutes: baselineTravel,
      savedMinutes: saved,
      existing: findTradeoff(tradeoffs, 'FATIGUE', 'IMPROVE') ?? findTradeoff(tradeoffs, 'TIME'),
    });
    if (time) upsertTradeoff(projected, time);

    const cost = buildCostRow({ existing: findTradeoff(tradeoffs, 'COST') });
    if (cost) upsertTradeoff(projected, cost);
  } else {
    const flex = buildFlexibilityRow({ savedMinutes: saved, shortfallMinutes: shortfall, baselineTravelMinutes: baselineTravel });
    if (flex) upsertTradeoff(projected, flex);

    if (baselineTravel != null) {
      const time = buildTimeRow({
        baselineTravelMinutes: baselineTravel,
        savedMinutes: saved,
        existing: findTradeoff(tradeoffs, 'TIME') ?? findTradeoff(tradeoffs, 'FATIGUE'),
      });
      if (time?.unit === 'MINUTE' && typeof time.value === 'number') upsertTradeoff(projected, time);
    }

    const poi = buildPoiCoverageRow({ existing: findTradeoff(tradeoffs, 'POI_COVERAGE') });
    if (poi?.unit === 'PERCENT') upsertTradeoff(projected, poi);
  }

  return prioritizeSpaceTradeoffs(projected);
}

function buildCanonicalSpaceTradeoffs(
  tradeoffs: TradeoffDimension[],
  ctx: DecisionSpaceOptionContext,
): TradeoffDimension[] {
  const candidate = ctx.candidate;
  const workspace = ctx.workspace;
  if (!candidate || !workspace) return prioritizeSpaceTradeoffs(tradeoffs);

  const projected: TradeoffDimension[] = [...tradeoffs];
  const originalLoad = workspace.loadAssessments.find((a) => a.targetCandidateId === 'original');
  const candidateLoad = workspace.loadAssessments.find((a) => a.targetCandidateId === candidate.candidateId);
  const originalStress = originalLoad
    ? (originalLoad.physicalLoad + originalLoad.scheduleStress) / 2
    : undefined;
  const candidateStress = candidateLoad
    ? (candidateLoad.physicalLoad + candidateLoad.scheduleStress) / 2
    : undefined;
  const loadImprovementRatio =
    originalStress != null && candidateStress != null && originalStress > candidateStress
      ? (originalStress - candidateStress) / Math.max(originalStress, 0.01)
      : undefined;

  const flex = buildFlexibilityRow({ loadImprovementRatio }) ?? buildFlexibilityRow({
    savedMinutes: Math.abs(candidate.estimatedAddedDurationMinutes),
    shortfallMinutes: Math.abs(candidate.estimatedAddedDurationMinutes) || undefined,
  });
  if (flex) upsertTradeoff(projected, flex);

  const preservation = candidate.estimatedIntentPreservation;
  const poi = buildPoiCoverageRow({
    preservationRatio: preservation,
    deltaPercent: clampPercent(preservation * 100) - 90,
    existing: findTradeoff(tradeoffs, 'POI_COVERAGE'),
  });
  if (poi) upsertTradeoff(projected, poi);

  const added = candidate.estimatedAddedDurationMinutes;
  if (added !== 0) {
    const baselineMinutes = 360;
    const after = Math.max(0, baselineMinutes + added);
    upsertTradeoff(
      projected,
      buildTimeRow({
        baselineTravelMinutes: baselineMinutes,
        afterTravelMinutes: after,
        direction: added >= 0 ? 'WORSEN' : 'IMPROVE',
      }) ?? {
        dimension: 'TIME',
        direction: added >= 0 ? 'WORSEN' : 'IMPROVE',
        value: Math.abs(added),
        unit: 'MINUTE',
        explanation: `行程时长${added >= 0 ? '增加' : '减少'} ${formatDriveDurationZhLong(Math.abs(added))}`,
      },
    );
  } else if (loadImprovementRatio != null && originalStress != null) {
    const thresholdMinutes = 6 * 60;
    const before = Math.round(thresholdMinutes * (1 + originalStress));
    const after = Math.round(thresholdMinutes * (1 + (candidateStress ?? 0)));
    const time = buildTimeRow({ baselineTravelMinutes: before, afterTravelMinutes: after, direction: 'IMPROVE' });
    if (time) upsertTradeoff(projected, time);
  }

  const costAmount = candidate.estimatedAddedCost?.amount;
  if (costAmount != null && costAmount > 0) {
    const cost = buildCostRow({
      amount: costAmount,
      existing: findTradeoff(tradeoffs, 'COST'),
    });
    if (cost) upsertTradeoff(projected, cost);
  }

  return prioritizeSpaceTradeoffs(projected);
}

export function prioritizeSpaceTradeoffs(tradeoffs: TradeoffDimension[]): TradeoffDimension[] {
  const byDimension = new Map<TradeoffDimensionKey, TradeoffDimension>();
  for (const row of tradeoffs) {
    if (!byDimension.has(row.dimension)) {
      byDimension.set(row.dimension, row);
    }
  }

  const prioritized: TradeoffDimension[] = [];
  for (const dim of SPACE_DIMENSION_PRIORITY) {
    const row = byDimension.get(dim);
    if (row) {
      prioritized.push(row);
      byDimension.delete(dim);
    }
  }
  for (const row of byDimension.values()) {
    prioritized.push(row);
  }
  return prioritized;
}

export function projectDecisionOptionForSpaceView(
  option: DecisionOption,
  ctx: DecisionSpaceOptionContext = {},
): DecisionOption {
  const tradeoffs = ctx.candidate
    ? buildCanonicalSpaceTradeoffs(option.tradeoffs, ctx)
    : buildLegacySpaceTradeoffs(option.tradeoffs, ctx);

  const placeNames = extractRoutePlaceNames(ctx);
  const routePreview: DecisionOptionRoutePreview | undefined =
    placeNames && placeNames.length >= 2 ? { placeNames } : option.routePreview;

  const tradeoffsWithNarrative = enrichTradeoffsWithContextualNarratives(tradeoffs, {
    issue: ctx.issue,
    affectedScopeDisplay: ctx.affectedScopeDisplay,
    optionTitle: option.title,
    optionDescription: option.description,
    placeNames,
  });

  return {
    ...option,
    tradeoffs: tradeoffsWithNarrative,
    ...(routePreview ? { routePreview } : {}),
  };
}

export function projectDecisionOptionsForSpaceView(
  options: DecisionOption[],
  ctx: Omit<DecisionSpaceOptionContext, 'repairOption' | 'candidate'> & {
    repairOptionsById?: Map<string, RepairOption>;
    candidatesById?: Map<string, Rfc001RepairCandidate>;
  },
): DecisionOption[] {
  return options.map((option) =>
    projectDecisionOptionForSpaceView(option, {
      ...ctx,
      repairOption: ctx.repairOptionsById?.get(option.id),
      candidate: ctx.candidatesById?.get(option.id),
    }),
  );
}
