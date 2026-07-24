/**
 * Evaluate catalog + user executionConditions before auto-apply.
 */

import type {
  AutomationExecutionConditions,
  AutomationActionDefinition,
} from '../automation-action.catalog';
import { getAutomationActionByKey } from '../automation-action.catalog';
import type { AutomationPolicy } from '../../../trips/trip-constraint-solver/types/travel-decision-contract.types';

export interface AutomationExecutionActionContext {
  actionId: string;
  title?: string;
  summary?: string;
  type?: string;
  requiresConfirmation?: boolean;
  expectedImpact?: {
    budgetDelta?: number;
    durationDelta?: number;
    affectedDays?: number[];
  };
}

export interface AutomationExecutionProblemContext {
  semanticKey?: string;
  affectedDayNumbers?: number[];
}

export interface AutomationExecutionContext {
  action: AutomationExecutionActionContext;
  problem?: AutomationExecutionProblemContext;
  minutesBeforeActivity?: number;
  touchesBookedItems?: boolean;
  touchesCoreActivities?: boolean;
  itemsChangedEstimate?: number;
}

export interface AutomationExecutionConditionsResult {
  allowed: boolean;
  reasonCodes: string[];
  violatedConditions: string[];
  effectiveConditions: AutomationExecutionConditions;
}

function mergeRestrictiveConditions(
  conditions: AutomationExecutionConditions[],
): AutomationExecutionConditions {
  if (conditions.length === 0) return {};

  const maxItems = conditions
    .map((c) => c.maxItemsPerChange)
    .filter((v): v is number => v != null);
  const minBefore = conditions
    .map((c) => c.minMinutesBeforeActivity)
    .filter((v): v is number => v != null);

  return {
    onlyUnbooked: conditions.some((c) => c.onlyUnbooked === true),
    excludeCoreActivities: conditions.some((c) => c.excludeCoreActivities === true),
    noCrossDay: conditions.some((c) => c.noCrossDay === true),
    noBudgetIncrease: conditions.some((c) => c.noBudgetIncrease === true),
    noDriveTimeIncrease: conditions.some((c) => c.noDriveTimeIncrease === true),
    maxItemsPerChange: maxItems.length > 0 ? Math.min(...maxItems) : undefined,
    minMinutesBeforeActivity: minBefore.length > 0 ? Math.max(...minBefore) : undefined,
    notifyOnApply: conditions.some((c) => c.notifyOnApply === true),
    teamCanUndo: conditions.some((c) => c.teamCanUndo === true),
  };
}

export function resolveEffectiveExecutionConditions(
  matchedActionKeys: string[],
  automation: AutomationPolicy,
): AutomationExecutionConditions {
  const merged: AutomationExecutionConditions[] = [];

  for (const key of matchedActionKeys) {
    const def = getAutomationActionByKey(key);
    merged.push({
      ...(def?.executionConditions ?? {}),
      ...(automation.executionConditions?.[key] ?? {}),
    });
  }

  return mergeRestrictiveConditions(merged);
}

function inferTouchesBooked(ctx: AutomationExecutionContext): boolean {
  if (ctx.touchesBookedItems != null) return ctx.touchesBookedItems;
  const blob = `${ctx.action.title ?? ''} ${ctx.action.summary ?? ''} ${ctx.action.type ?? ''}`.toLowerCase();
  return (
    ctx.action.requiresConfirmation === true ||
    /booked|预订|reserved|已订/.test(blob) ||
    /adjust_booked|modify_booking/.test(blob)
  );
}

function inferTouchesCore(ctx: AutomationExecutionContext): boolean {
  if (ctx.touchesCoreActivities != null) return ctx.touchesCoreActivities;
  const blob = `${ctx.action.title ?? ''} ${ctx.action.summary ?? ''} ${ctx.action.actionId}`.toLowerCase();
  return /core|核心|must_experience|must_place/.test(blob);
}

function inferItemsChanged(ctx: AutomationExecutionContext): number {
  if (ctx.itemsChangedEstimate != null) return ctx.itemsChangedEstimate;
  const blob = `${ctx.action.summary ?? ''}`.toLowerCase();
  const match = blob.match(/(\d+)\s*(项|个|处)/);
  if (match) return Number(match[1]);
  return 1;
}

function inferCrossDay(ctx: AutomationExecutionContext): boolean {
  const days =
    ctx.action.expectedImpact?.affectedDays ?? ctx.problem?.affectedDayNumbers ?? [];
  if (days.length > 1) return true;

  const blob = `${ctx.action.title ?? ''} ${ctx.action.summary ?? ''}`.toLowerCase();
  return /跨天|cross.?day|inter_day|换城市/.test(blob);
}

export function evaluateAutomationExecutionConditions(input: {
  matchedActionKeys: string[];
  automation: AutomationPolicy;
  context: AutomationExecutionContext;
}): AutomationExecutionConditionsResult {
  const effectiveConditions = resolveEffectiveExecutionConditions(
    input.matchedActionKeys,
    input.automation,
  );
  const violatedConditions: string[] = [];
  const reasonCodes: string[] = ['EXECUTION_CONDITIONS_EVALUATED'];

  if (Object.keys(effectiveConditions).length === 0) {
    return {
      allowed: true,
      reasonCodes: [...reasonCodes, 'NO_CONDITIONS_CONFIGURED'],
      violatedConditions: [],
      effectiveConditions,
    };
  }

  const ctx = input.context;

  if (effectiveConditions.onlyUnbooked && inferTouchesBooked(ctx)) {
    violatedConditions.push('onlyUnbooked');
  }
  if (effectiveConditions.excludeCoreActivities && inferTouchesCore(ctx)) {
    violatedConditions.push('excludeCoreActivities');
  }
  if (effectiveConditions.noCrossDay && inferCrossDay(ctx)) {
    violatedConditions.push('noCrossDay');
  }
  if (
    effectiveConditions.noBudgetIncrease &&
    (ctx.action.expectedImpact?.budgetDelta ?? 0) > 0
  ) {
    violatedConditions.push('noBudgetIncrease');
  }
  if (
    effectiveConditions.noDriveTimeIncrease &&
    (ctx.action.expectedImpact?.durationDelta ?? 0) > 0
  ) {
    violatedConditions.push('noDriveTimeIncrease');
  }
  if (
    effectiveConditions.maxItemsPerChange != null &&
    inferItemsChanged(ctx) > effectiveConditions.maxItemsPerChange
  ) {
    violatedConditions.push('maxItemsPerChange');
  }
  if (
    effectiveConditions.minMinutesBeforeActivity != null &&
    ctx.minutesBeforeActivity != null &&
    ctx.minutesBeforeActivity < effectiveConditions.minMinutesBeforeActivity
  ) {
    violatedConditions.push('minMinutesBeforeActivity');
  }

  if (violatedConditions.length > 0) {
    reasonCodes.push('EXECUTION_CONDITIONS_VIOLATED');
  } else {
    reasonCodes.push('EXECUTION_CONDITIONS_PASSED');
  }

  return {
    allowed: violatedConditions.length === 0,
    reasonCodes,
    violatedConditions,
    effectiveConditions,
  };
}

export function buildExecutionContextFromAction(input: {
  action: AutomationExecutionActionContext;
  problem?: AutomationExecutionProblemContext;
}): AutomationExecutionContext {
  return {
    action: input.action,
    problem: input.problem,
  };
}

export function matchedActionKeysFromDefinitions(
  actions: AutomationActionDefinition[],
): string[] {
  return actions.map((a) => a.key);
}
