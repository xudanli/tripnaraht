/**
 * Maps WorldOperationalArbitration → concrete planner / route restrictions (Execution Policy Hook v2).
 * Pure function — safe to call from policy.resolve and tests.
 */

import type { OperationalArbitration } from './world-operational-arbitrator';
import {
  buildRecoveryActionsFromBlocking,
  deriveCausedByPoliciesFromArbitration,
  executionStatusToPolicyStrengthDominant,
  freezeExecutionPolicyHook,
  type FrozenExecutionPolicyHook,
} from './execution-governance.contract';

export interface ArbitrationPolicyOverlay {
  drivingPolicy: Record<string, unknown>;
  routePolicy: Record<string, unknown>;
  lodgingPolicy: Record<string, unknown>;
  riskPolicy: Record<string, unknown>;
  executionPolicyHook: FrozenExecutionPolicyHook;
}

export function applyOperationalArbitrationToPolicies(
  arbitration: OperationalArbitration,
  base: {
    drivingPolicy: Record<string, unknown>;
    routePolicy: Record<string, unknown>;
    lodgingPolicy: Record<string, unknown>;
    riskPolicy: Record<string, unknown>;
  },
): ArbitrationPolicyOverlay {
  const { executionStatus, enforcedPolicies, confidence, rawSeverity } = arbitration;
  const drivingPolicy = { ...base.drivingPolicy };
  const routePolicy = { ...base.routePolicy };
  const lodgingPolicy = { ...base.lodgingPolicy };
  const riskPolicy = { ...base.riskPolicy };

  riskPolicy.executionStatus = executionStatus;
  riskPolicy.arbitrationRawSeverity = rawSeverity;
  riskPolicy.arbitrationBlockingReasons = arbitration.blockingReasons;
  riskPolicy.arbitrationRecommendedActions = arbitration.recommendedActions;
  riskPolicy.arbitrationEnforcedPolicies = enforcedPolicies;

  let denyLongDistanceAutorouting = false;
  let maxSingleLegDriveHours: number | undefined;
  let forcedMinimumVehicleClass: string | null | undefined;
  let haltAutomatedExecution = false;

  if (executionStatus === 'blocked') {
    haltAutomatedExecution = true;
    denyLongDistanceAutorouting = true;
    maxSingleLegDriveHours = 2.5;
    routePolicy.allowFRoads = false;
    routePolicy.allowLongDistanceAutorouting = false;
    routePolicy.maxSingleLegDriveHours = maxSingleLegDriveHours;
    drivingPolicy.automationPace = 'halt_until_operational_unblocked';
    drivingPolicy.maxNightDrivingRisk = 'low';
    lodgingPolicy.hubAndSpokeBias = true;
  } else if (executionStatus === 'dangerous') {
    denyLongDistanceAutorouting = true;
    maxSingleLegDriveHours = 4;
    forcedMinimumVehicleClass = '4WD_OR_EQUIVALENT';
    routePolicy.allowLongDistanceAutorouting = false;
    routePolicy.maxSingleLegDriveHours = maxSingleLegDriveHours;
    drivingPolicy.forcedMinimumVehicleClass = forcedMinimumVehicleClass;
    drivingPolicy.automationPace = 'human_ack_required';
    drivingPolicy.maxNightDrivingRisk = 'low';
  } else if (executionStatus === 'caution') {
    maxSingleLegDriveHours = 7;
    routePolicy.maxSingleLegDriveHours = maxSingleLegDriveHours;
    routePolicy.requireBufferBetweenLongLegs = true;
    drivingPolicy.automationPace = 'conservative';
  } else {
    routePolicy.allowLongDistanceAutorouting = routePolicy.allowLongDistanceAutorouting ?? true;
  }

  for (const p of enforcedPolicies) {
    if (p.includes('4x4') || p.includes('4wd')) {
      forcedMinimumVehicleClass = forcedMinimumVehicleClass ?? '4WD_OR_EQUIVALENT';
      drivingPolicy.forcedMinimumVehicleClass = forcedMinimumVehicleClass;
    }
  }

  const causedByPolicies = deriveCausedByPoliciesFromArbitration(arbitration.blockingReasons);
  const recoverySuggestions = buildRecoveryActionsFromBlocking(arbitration.blockingReasons);
  const executionPolicyHook = freezeExecutionPolicyHook({
    policySource: 'operational_arbitration_policy_resolve_v1',
    policyGeneratedAt: Date.now(),
    causedByPolicies,
    policyStrengthDominant: executionStatusToPolicyStrengthDominant(executionStatus),
    executionStatus,
    denyLongDistanceAutorouting,
    maxSingleLegDriveHours,
    forcedMinimumVehicleClass: forcedMinimumVehicleClass ?? null,
    haltAutomatedExecution,
    arbitrationConfidence: confidence,
    rawSeverity: String(rawSeverity),
    blockingSummary: [...arbitration.blockingReasons],
    recoverySuggestions,
  });

  return { drivingPolicy, routePolicy, lodgingPolicy, riskPolicy, executionPolicyHook };
}
