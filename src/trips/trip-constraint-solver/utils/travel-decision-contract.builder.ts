/**
 * 从 trip.metadata + 聚合约束构建 TravelDecisionContract 读模型
 */

import type { PlanningConflictItem } from '../types/planning-conflicts.types';
import type { TripConstraint } from '../types/trip-constraint.types';
import {
  TRAVEL_PRINCIPLE_LABELS,
  type AutomationAuthorizationScope,
  type AutomationPolicy,
  type ChangeStrategyProfile,
  type StoredTravelDecisionContract,
  type TeamGovernancePolicy,
  type TravelDecisionContract,
  type TravelDecisionContractPatch,
  type TravelObjectiveProfile,
} from '../types/travel-decision-contract.types';
import {
  buildDefaultTravelObjectiveProfile,
  compileObjectiveWeights,
} from './travel-objective.compiler';
import { mergeSoftConstraintsIntoCompiledWeights } from './soft-constraint-weights.util';
import { DEFAULT_AUTOMATION_EXPORT } from './travel-decision-contract.defaults';

const DEFAULT_AUTOMATION = DEFAULT_AUTOMATION_EXPORT;

const DEFAULT_CHANGE_STRATEGY: ChangeStrategyProfile = {
  archetype: 'BALANCED',
  tolerances: {
    maxBudgetOverrunPct: 10,
    maxDelayMinutes: 60,
    maxPoiRemovals: 2,
    allowTemporaryLodgingChange: false,
    allowSameDayReroute: true,
    acceptLowConfidencePlans: false,
  },
};

const DEFAULT_TEAM_GOVERNANCE: TeamGovernancePolicy = {
  rules: [
    { topic: '高风险活动', rule: 'UNANIMOUS' },
    { topic: '预算增加', rule: 'PAYER_CONFIRM', thresholdPct: 15 },
    { topic: '老人步行超限', rule: 'PROTECTIVE_PRIORITY' },
    { topic: '餐饮选择', rule: 'MAJORITY' },
  ],
};

export function readStoredTravelDecisionContract(
  metadata: Record<string, unknown>,
): StoredTravelDecisionContract | undefined {
  const raw = metadata.travelDecisionContract;
  if (!raw || typeof raw !== 'object') return undefined;
  return raw as StoredTravelDecisionContract;
}

function resolveObjectives(
  stored: StoredTravelDecisionContract | undefined,
  metadata: Record<string, unknown>,
  pacing: Record<string, unknown>,
): TravelObjectiveProfile {
  if (stored?.objectives?.rankedPrinciples?.length) {
    return stored.objectives;
  }

  const constraints = (metadata.constraints as Record<string, unknown>) ?? {};
  return buildDefaultTravelObjectiveProfile({
    pacingLevel: pacing.level as string | undefined,
    planningPolicy: metadata.planningPolicy as string | undefined,
    hasBudget: metadata.budgetConfig != null,
    hasMustPlaces: Array.isArray(constraints.mustPlaces) && constraints.mustPlaces.length > 0,
  });
}

function resolveChangeStrategy(
  stored: StoredTravelDecisionContract | undefined,
  metadata: Record<string, unknown>,
): ChangeStrategyProfile {
  if (stored?.changeStrategy) {
    return {
      ...DEFAULT_CHANGE_STRATEGY,
      ...stored.changeStrategy,
      tolerances: {
        ...DEFAULT_CHANGE_STRATEGY.tolerances,
        ...stored.changeStrategy.tolerances,
      },
    };
  }

  const policy = String(metadata.planningPolicy ?? '').toUpperCase();
  if (policy === 'CONSERVATIVE') {
    return {
      archetype: 'CONSERVATIVE',
      tolerances: {
        ...DEFAULT_CHANGE_STRATEGY.tolerances,
        maxBudgetOverrunPct: 5,
        maxPoiRemovals: 1,
        allowSameDayReroute: false,
        acceptLowConfidencePlans: false,
      },
    };
  }
  if (policy === 'EXPLORATORY') {
    return {
      archetype: 'EXPLORATORY',
      tolerances: {
        ...DEFAULT_CHANGE_STRATEGY.tolerances,
        maxBudgetOverrunPct: 20,
        maxPoiRemovals: 4,
        allowTemporaryLodgingChange: true,
        acceptLowConfidencePlans: true,
      },
    };
  }
  return { ...DEFAULT_CHANGE_STRATEGY };
}

function resolveAutomation(stored: StoredTravelDecisionContract | undefined): AutomationPolicy {
  if (!stored?.automation) return { ...DEFAULT_AUTOMATION };
  return {
    ...DEFAULT_AUTOMATION,
    ...stored.automation,
    autoAllowed: stored.automation.autoAllowed ?? DEFAULT_AUTOMATION.autoAllowed,
    confirmationRequired:
      stored.automation.confirmationRequired ?? DEFAULT_AUTOMATION.confirmationRequired,
    actionOverrides: {
      ...stored.automation.actionOverrides,
    },
    executionConditions: {
      ...stored.automation.executionConditions,
    },
  };
}

function resolveTeamGovernance(
  stored: StoredTravelDecisionContract | undefined,
): TeamGovernancePolicy {
  if (stored?.teamGovernance?.rules?.length) return stored.teamGovernance;
  return { ...DEFAULT_TEAM_GOVERNANCE };
}

export function buildTravelDecisionContract(input: {
  tripId: string;
  constraintsVersion: number;
  metadata: Record<string, unknown>;
  pacing: Record<string, unknown>;
  items: TripConstraint[];
  conflicts: PlanningConflictItem[];
  conflictConstraintIds: Set<string>;
}): TravelDecisionContract {
  const stored = readStoredTravelDecisionContract(input.metadata);
  const objectives = resolveObjectives(stored, input.metadata, input.pacing);
  const compiledWeights = mergeSoftConstraintsIntoCompiledWeights(
    compileObjectiveWeights(objectives),
    input.items,
  );

  let mustHandle = 0;
  let suggestAdjust = 0;
  let pendingConfirm = 0;
  for (const c of input.conflicts) {
    if (c.priority === 'must_handle') mustHandle += 1;
    else if (c.priority === 'suggest_adjust') suggestAdjust += 1;
    else if (c.priority === 'pending_confirm') pendingConfirm += 1;
  }

  return {
    schemaId: 'tripnara.travel_decision_contract@v1',
    tripId: input.tripId,
    constraintsVersion: input.constraintsVersion,
    objectives,
    displayPrinciples: objectives.rankedPrinciples.map((key, index) => ({
      key,
      label: TRAVEL_PRINCIPLE_LABELS[key],
      rank: index + 1,
    })),
    compiledWeights,
    changeStrategy: resolveChangeStrategy(stored, input.metadata),
    automation: resolveAutomation(stored),
    teamGovernance: resolveTeamGovernance(stored),
    conflicts: {
      hasConflicts: mustHandle + suggestAdjust + pendingConfirm > 0,
      mustHandle,
      suggestAdjust,
      pendingConfirm,
      conflictConstraintIds: [...input.conflictConstraintIds],
    },
  };
}

export function mergeStoredTravelDecisionContract(
  existing: StoredTravelDecisionContract | undefined,
  patch: TravelDecisionContractPatch,
): StoredTravelDecisionContract {
  const next: StoredTravelDecisionContract = { ...(existing ?? {}) };

  if (patch.objectives) {
    next.objectives = {
      ...(existing?.objectives ?? { version: 0, rankedPrinciples: [] }),
      ...patch.objectives,
      version: (existing?.objectives?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
    };
  }
  if (patch.changeStrategy) {
    next.changeStrategy = {
      ...(existing?.changeStrategy ?? DEFAULT_CHANGE_STRATEGY),
      ...patch.changeStrategy,
      tolerances: {
        ...(existing?.changeStrategy?.tolerances ?? DEFAULT_CHANGE_STRATEGY.tolerances),
        ...patch.changeStrategy.tolerances,
      },
    };
  }
  if (patch.automation) {
    const baseAutomation = patch.resetAutomationToDefaults
      ? { ...DEFAULT_AUTOMATION }
      : { ...(existing?.automation ?? DEFAULT_AUTOMATION), ...patch.automation };

    next.automation = {
      ...baseAutomation,
      actionOverrides: patch.resetAutomationToDefaults
        ? patch.automation.actionOverrides ?? {}
        : {
            ...(existing?.automation?.actionOverrides ?? {}),
            ...(patch.automation.actionOverrides ?? {}),
          },
      executionConditions: patch.resetAutomationToDefaults
        ? patch.automation.executionConditions ?? {}
        : {
            ...(existing?.automation?.executionConditions ?? {}),
            ...(patch.automation.executionConditions ?? {}),
          },
    };
  } else if (patch.resetAutomationToDefaults) {
    next.automation = { ...DEFAULT_AUTOMATION };
  }
  if (patch.teamGovernance) {
    next.teamGovernance = {
      ...(existing?.teamGovernance ?? DEFAULT_TEAM_GOVERNANCE),
      ...patch.teamGovernance,
    };
  }
  if (patch.automationPaused !== undefined) {
    next.automationPaused = patch.automationPaused;
  }
  if (patch.automationScope !== undefined) {
    next.automationScope = patch.automationScope;
  }

  return next;
}
