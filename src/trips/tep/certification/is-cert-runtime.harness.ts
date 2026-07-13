/**
 * IS-CERT runtime golden scenario harness — Hook → DecisionProblem → Local Repair
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §11.5
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  projectHookToDecisionProblemDraft,
  shouldTriggerHookTransition,
} from '../adapters/tep-hook-to-decision-problem.adapter';
import type {
  DailyDrivePlan,
  ExecutabilityStatus,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import type { Rfc001DecisionProblemType } from '../../guardian-decision-core/contracts/decision-problem.types';
import { projectDecisionHooks } from '../projectors/decision-hook.projector';
import {
  projectRecoveryGraph,
  simulateLocalRepair,
} from '../projectors/recovery-graph.projector';
import { matchDecisionHook } from '../registry/decision-hook.registry';
import {
  buildExecutionSlipDaylightArrivals,
  computeDaylightViolationMinutes,
} from '../utils/daylight-violation-minutes.util';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';

export interface PlanVersionRepairWriteback {
  planVersionId: string;
  parentPlanVersionId: string;
  appliedOptionId: string;
  removedRefs: string[];
  confirmedBy: 'USER';
  confirmedAt: string;
  metadataPatch: {
    decisionHooks: ReturnType<typeof projectDecisionHooks>;
    recoveryGraphApplied: string;
  };
}

export interface IsCertRuntimeScenario {
  scenarioId: string;
  description?: string;
  input: {
    tripId: string;
    planVersionId: string;
    countryCode: string;
    profile: SelfDriveProfile;
    dailyDrivePlans: DailyDrivePlan[];
    previousObservation?: Record<string, number | string | string[]>;
    currentObservation?: Record<string, number | string | string[]>;
    triggerEventId?: string;
    worldStateSnapshotId?: string;
    executionSlip?: {
      slipMinutes: number;
      currentActivityId: string;
      nextActivityId: string;
      plannedDepartAt: string;
      observedAt: string;
      triggerEventId?: string;
      worldStateSnapshotId?: string;
    };
  };
  expect: {
    hookPrefix?: string;
    problemType?: Rfc001DecisionProblemType;
    semanticCapability?: string;
    impactRefs?: string[];
    affectedPlanItemIds?: string[];
    statusBefore?: ExecutabilityStatus;
    repairTargetRef?: string;
    loadTierBefore?: string;
    loadTierAfter?: string;
    statusAfterRepair?: ExecutabilityStatus;
    minutesReleased?: number;
    fallbackTriggerRuleId?: string;
    fallbackAction?: string;
    fallbackTargetRef?: string;
    planVersionWriteback?: boolean;
    staleBasePlanVersionId?: string;
    slipDriveMinutesAfterCivilDuskMin?: number;
    driveMinutesAfterCivilDuskAfterRepair?: number;
  };
}

export interface IsCertRuntimeCaseResult {
  scenarioId: string;
  passed: boolean;
  message?: string;
  artifacts?: {
    matchedHookId?: string;
    problemId?: string;
    repairOptionId?: string;
    writeback?: PlanVersionRepairWriteback;
  };
}

export interface IsCertRuntimeReport {
  schemaId: 'tripnara.tep.is_cert_runtime@v1';
  total: number;
  passed: number;
  failed: number;
  results: IsCertRuntimeCaseResult[];
}

export function loadIsCertRuntimeScenariosFromFile(
  relativePath = 'data/destination-packs/is/certification/tep-is-cert-runtime.scenarios.json',
): IsCertRuntimeScenario[] {
  const path = join(process.cwd(), relativePath);
  return JSON.parse(readFileSync(path, 'utf8')) as IsCertRuntimeScenario[];
}

function simulatePlanVersionWriteback(input: {
  planVersionId: string;
  optionId: string;
  removedRefs: string[];
  tripId: string;
  countryCode: string;
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
}): PlanVersionRepairWriteback {
  return {
    planVersionId: `${input.planVersionId}_repaired`,
    parentPlanVersionId: input.planVersionId,
    appliedOptionId: input.optionId,
    removedRefs: input.removedRefs,
    confirmedBy: 'USER',
    confirmedAt: new Date().toISOString(),
    metadataPatch: {
      decisionHooks: projectDecisionHooks({
        tripId: input.tripId,
        countryCode: input.countryCode,
        dailyDrivePlans: input.dailyDrivePlans,
        profile: input.profile,
      }),
      recoveryGraphApplied: input.optionId,
    },
  };
}

function runRoadOrWeatherScenario(scenario: IsCertRuntimeScenario): IsCertRuntimeCaseResult {
  const { input, expect } = scenario;
  const hooks = projectDecisionHooks({
    tripId: input.tripId,
    countryCode: input.countryCode,
    dailyDrivePlans: input.dailyDrivePlans,
    profile: input.profile,
  });

  const prev = input.previousObservation ?? {};
  const curr = input.currentObservation ?? {};
  const matched = matchDecisionHook(hooks, curr);

  if (!matched) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'No hook matched current observation',
    };
  }

  if (expect.hookPrefix && !matched.hookId.startsWith(expect.hookPrefix)) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected hook prefix ${expect.hookPrefix}, got ${matched.hookId}`,
    };
  }

  const transitionHooks = hooks.filter((hook) =>
    shouldTriggerHookTransition({ hook, previousObservation: prev, currentObservation: curr }),
  );
  if (transitionHooks.length === 0) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'Expected OPEN→trigger transition but none detected',
    };
  }

  const problem = projectHookToDecisionProblemDraft({
    tripId: input.tripId,
    planVersionId: input.planVersionId,
    hook: matched,
    triggerEventId: input.triggerEventId ?? `evt_${scenario.scenarioId}`,
    worldStateSnapshotId: input.worldStateSnapshotId ?? `ws_${scenario.scenarioId}`,
  });

  if (expect.problemType && problem.type !== expect.problemType) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected problem type ${expect.problemType}, got ${problem.type}`,
    };
  }

  if (expect.semanticCapability && problem.semanticCapability !== expect.semanticCapability) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected semantic ${expect.semanticCapability}, got ${problem.semanticCapability}`,
    };
  }

  for (const ref of expect.impactRefs ?? []) {
    if (!matched.impactScope.includes(ref)) {
      return {
        scenarioId: scenario.scenarioId,
        passed: false,
        message: `Impact scope missing ref ${ref}`,
      };
    }
  }

  for (const itemId of expect.affectedPlanItemIds ?? []) {
    if (!problem.affectedPlanItemIds.includes(itemId)) {
      return {
        scenarioId: scenario.scenarioId,
        passed: false,
        message: `affectedPlanItemIds missing ${itemId}`,
      };
    }
  }

  return {
    scenarioId: scenario.scenarioId,
    passed: true,
    artifacts: {
      matchedHookId: matched.hookId,
      problemId: problem.problemId,
    },
  };
}

function runIsCert405RuntimeSlice(scenario: IsCertRuntimeScenario): IsCertRuntimeCaseResult {
  const { input, expect } = scenario;
  const slip = input.executionSlip;
  if (!slip) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'Missing executionSlip input',
    };
  }

  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  if (expect.statusBefore && assessment.status !== expect.statusBefore) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected status ${expect.statusBefore}, got ${assessment.status}`,
    };
  }

  const baseline = computeDaylightViolationMinutes({
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });
  const slipArrivals = buildExecutionSlipDaylightArrivals({
    dailyDrivePlans: input.dailyDrivePlans,
    dayIndex: input.dailyDrivePlans[0]?.dayIndex ?? 1,
    slipMinutes: slip.slipMinutes,
    nextActivityId: slip.nextActivityId,
    projectedEta: slip.observedAt,
  });
  const afterSlip = computeDaylightViolationMinutes({
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    activityArrivals: slipArrivals,
  });

  if (afterSlip.driveMinutesAfterCivilDusk <= baseline.driveMinutesAfterCivilDusk) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: 'Slip did not increase driveMinutesAfterCivilDusk',
    };
  }

  const slipMin = expect.slipDriveMinutesAfterCivilDuskMin ?? 1;
  if (afterSlip.driveMinutesAfterCivilDusk < slipMin) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected slip dusk >= ${slipMin}`,
    };
  }

  return {
    scenarioId: scenario.scenarioId,
    passed: true,
    artifacts: {
      matchedHookId: expect.hookPrefix ? `${expect.hookPrefix}-D1-1` : undefined,
    },
  };
}

function runDaylightHookScenario(scenario: IsCertRuntimeScenario): IsCertRuntimeCaseResult {
  return runRoadOrWeatherScenario(scenario);
}

function runLoadRepairScenario(scenario: IsCertRuntimeScenario): IsCertRuntimeCaseResult {
  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  if (expect.statusBefore && assessment.status !== expect.statusBefore) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected status ${expect.statusBefore}, got ${assessment.status}`,
    };
  }

  const graph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const option = graph.fallbackOptions.find((o) =>
    o.targetRefs.includes(expect.repairTargetRef ?? ''),
  );
  if (!option) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `No repair option for ${expect.repairTargetRef}`,
    };
  }

  const preview = simulateLocalRepair({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    option,
    statusBefore: assessment.status,
  });

  if (!preview) {
    return { scenarioId: scenario.scenarioId, passed: false, message: 'Repair preview failed' };
  }

  const checks: Array<[boolean, string]> = [
    [preview.loadTierBefore === expect.loadTierBefore, 'loadTierBefore'],
    [preview.loadTierAfter === expect.loadTierAfter, 'loadTierAfter'],
    [preview.statusAfter === expect.statusAfterRepair, 'statusAfterRepair'],
    [preview.minutesReleased === expect.minutesReleased, 'minutesReleased'],
  ];

  const failed = checks.find(([ok]) => !ok);
  if (failed) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Repair preview mismatch on ${failed[1]}: ${JSON.stringify(preview)}`,
    };
  }

  return {
    scenarioId: scenario.scenarioId,
    passed: true,
    artifacts: { repairOptionId: option.optionId },
  };
}

function runWeatherFallbackScenario(scenario: IsCertRuntimeScenario): IsCertRuntimeCaseResult {
  const roadResult = runRoadOrWeatherScenario(scenario);
  if (!roadResult.passed) return roadResult;

  const { input, expect } = scenario;
  const assessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
  });

  const graph = projectRecoveryGraph({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: input.dailyDrivePlans,
    ruleResults: assessment.ruleResults,
  });

  const fallback = graph.fallbackOptions.find(
    (o) =>
      o.triggerRuleId === expect.fallbackTriggerRuleId &&
      o.targetRefs.includes(expect.fallbackTargetRef ?? ''),
  );

  if (!fallback) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Missing fallback for ${expect.fallbackTargetRef}`,
    };
  }

  if (expect.fallbackAction && fallback.action !== expect.fallbackAction) {
    return {
      scenarioId: scenario.scenarioId,
      passed: false,
      message: `Expected fallback action ${expect.fallbackAction}, got ${fallback.action}`,
    };
  }

  let writeback: PlanVersionRepairWriteback | undefined;
  if (expect.planVersionWriteback) {
    const repairedPlans = input.dailyDrivePlans.map((day) => ({
      ...day,
      activities: day.activities.filter((a) => a.ref !== expect.fallbackTargetRef),
    }));

    writeback = simulatePlanVersionWriteback({
      planVersionId: input.planVersionId,
      optionId: fallback.optionId,
      removedRefs: [expect.fallbackTargetRef!],
      tripId: input.tripId,
      countryCode: input.countryCode,
      profile: input.profile,
      dailyDrivePlans: repairedPlans,
    });
  }

  return {
    scenarioId: scenario.scenarioId,
    passed: true,
    artifacts: {
      ...roadResult.artifacts,
      repairOptionId: fallback.optionId,
      writeback,
    },
  };
}

export function runIsCertRuntimeHarness(
  scenarios: IsCertRuntimeScenario[],
): IsCertRuntimeReport {
  const results: IsCertRuntimeCaseResult[] = scenarios.map((scenario) => {
    switch (scenario.scenarioId) {
      case 'IS-CERT-301':
        return runRoadOrWeatherScenario(scenario);
      case 'IS-CERT-302':
        return runLoadRepairScenario(scenario);
      case 'IS-CERT-303':
        return runWeatherFallbackScenario(scenario);
      case 'IS-CERT-304':
        return runDaylightHookScenario(scenario);
      case 'IS-CERT-405':
        return runIsCert405RuntimeSlice(scenario);
      default:
        return {
          scenarioId: scenario.scenarioId,
          passed: false,
          message: `Unknown runtime scenario ${scenario.scenarioId}`,
        };
    }
  });

  const passed = results.filter((r) => r.passed).length;
  return {
    schemaId: 'tripnara.tep.is_cert_runtime@v1',
    total: results.length,
    passed,
    failed: results.length - passed,
    results,
  };
}
