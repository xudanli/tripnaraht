/**
 * VerificationResult + ExperienceIntent → RepairContract（PRD §12）
 */

import type { ExperienceIntentDigest } from '../types/experience-intent.types';
import type { RepairContract, RepairActionKind } from '../types/repair-contract.types';
import type { VerificationResult } from '../types/verification-result.types';
import type { TripContextSchema } from '../types/trip-context.types';

export type RepairContractBuildOptions = {
  contractId?: string;
  targetIds?: string[];
  ruleVersion?: string;
  tripContext?: Partial<TripContextSchema>;
  /** 默认 2 轮（PRD §9.8） */
  maxRepairRounds?: number;
};

function inferRepairActions(violations: VerificationResult['hardViolations']): RepairActionKind[] {
  const actions = new Set<RepairActionKind>();
  const codes = violations.map((v) => v.code.toUpperCase());

  if (codes.some((c) => c.includes('F_ROAD') || c.includes('TERRAIN') || c.includes('ROAD'))) {
    actions.add('REPLACE_ITEM');
  }
  if (codes.some((c) => c.includes('TIME') || c.includes('FATIGUE') || c.includes('OVERLOAD'))) {
    actions.add('REORDER_ITEMS');
    actions.add('SHORTEN_DWELL');
    actions.add('REMOVE_OPTIONAL_ITEM');
  }
  if (codes.some((c) => c.includes('SPLIT') || c.includes('PARTICIPANT'))) {
    actions.add('SPLIT_PARTICIPANTS');
  }
  if (!actions.size) {
    actions.add('REPLACE_ITEM');
    actions.add('REMOVE_OPTIONAL_ITEM');
  }
  return Array.from(actions);
}

function preserveGoalsFromIntent(intent: ExperienceIntentDigest): RepairContract['preserveGoals'] {
  const goals = intent.experienceIntents
    .filter((i) => i.priority === 'MUST_PRESERVE' || i.priority === 'HIGH' || i.weight >= 0.75)
    .map((i) => ({
      intent: i.atom,
      minimumScore: i.priority === 'MUST_PRESERVE' ? Math.max(0.65, i.weight - 0.1) : i.weight * 0.85,
      priority: i.priority === 'MUST_PRESERVE' ? 'MUST_PRESERVE' as const : 'HIGH' as const,
    }));

  if (!goals.some((g) => g.priority === 'MUST_PRESERVE')) {
    const top = [...intent.experienceIntents].sort((a, b) => b.weight - a.weight)[0];
    if (top) {
      goals.unshift({
        intent: top.atom,
        minimumScore: top.weight * 0.8,
        priority: 'MUST_PRESERVE',
      });
    }
  }
  return goals;
}

export function buildRepairContractFromVerification(
  verification: VerificationResult,
  experienceIntent: ExperienceIntentDigest,
  options: RepairContractBuildOptions = {},
): RepairContract | null {
  if (verification.status !== 'REPAIR_REQUIRED') {
    return null;
  }

  const vehicleAccess = options.tripContext?.vehicle?.accessClass;
  const preserveGoals = preserveGoalsFromIntent(experienceIntent);
  const fRoadViolation = verification.hardViolations.some((v) =>
    v.code.toUpperCase().includes('F_ROAD') ||
    v.code.toUpperCase().includes('TERRAIN'),
  );

  const replacementSearchSpace: RepairContract['replacementSearchSpace'] = {
    geoBounds: { maxRadiusKm: 50 },
    vehicleAccess: vehicleAccess ? [vehicleAccess] : ['2WD', '4WD'],
    maxDetourMinutes: 45,
    excludedPoiIds: [],
  };

  if (fRoadViolation && vehicleAccess === '2WD') {
    replacementSearchSpace.vehicleAccess = ['2WD'];
    replacementSearchSpace.maxDetourMinutes = 60;
  }

  if (options.tripContext?.budget?.max) {
    replacementSearchSpace.budgetLimit = options.tripContext.budget.max;
  }

  const immutableConstraints: RepairContract['immutableConstraints'] = [];
  if (vehicleAccess) {
    immutableConstraints.push({
      field: 'vehicle.accessClass',
      value: vehicleAccess,
      reason: '用户车型约束不可由 LLM 绕过',
    });
  }

  return {
    contractId: options.contractId ?? `rc-${verification.verificationRunId}`,
    scope: verification.scope,
    targetIds: options.targetIds ?? [],
    trigger: {
      verificationRunId: verification.verificationRunId,
      generatedAt: new Date().toISOString(),
      ruleVersion: options.ruleVersion ?? 'experience-fulfillment@1',
    },
    violations: verification.hardViolations,
    immutableConstraints,
    preserveGoals,
    relaxableConstraints: [
      {
        field: 'maxDetourMinutes',
        currentValue: replacementSearchSpace.maxDetourMinutes,
        allowedRange: { min: 15, max: 90 },
      },
      {
        field: 'expectedDwellMinutes',
        currentValue: null,
        allowedRange: { min: 0.5, max: 1.0 },
      },
    ],
    replacementSearchSpace,
    optimizationObjective: {
      primary: 'preserve_experience_intent',
      secondary: ['minimize_detour', 'maximize_evidence_confidence'],
    },
    repairActionsAllowed: inferRepairActions(verification.hardViolations),
    userDecisionRequired:
      verification.userDecisionsRequired.length > 0
        ? verification.userDecisionsRequired
        : undefined,
    terminationConditions: {
      maxRepairRounds: options.maxRepairRounds ?? 2,
      minimumAcceptableScore: 0.65,
    },
  };
}
