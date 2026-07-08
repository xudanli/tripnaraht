/**
 * Canonical ConstraintAssertion → Rfc001ConstraintAssertion for Decision Core workspace.
 */

import { randomUUID } from 'crypto';
import type { Rfc001ConstraintAssertion } from '../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { ConstraintAssertion } from '../constraints/contracts/constraint-assertion';

export function mapCanonicalAssertionToGuardian(input: {
  assertion: ConstraintAssertion;
  workspaceId: string;
  targetCandidateId: string;
}): Rfc001ConstraintAssertion {
  const { assertion, workspaceId, targetCandidateId } = input;
  const verdict = mapStatusToGuardianVerdict(assertion);
  const actor = inferActor(assertion.constraintType);

  return {
    assertionId: assertion.assertionId || `gw_${randomUUID()}`,
    workspaceId,
    actor,
    targetCandidateId,
    affectedEntityRefs: [],
    affectedPlanItemIds: assertion.scope.activityId ? [assertion.scope.activityId] : [],
    verdict,
    constraintCode: assertion.constraintType,
    reasonCodes: [assertion.reasonCode],
    evidenceRefs: assertion.evidenceRefs,
    ruleVersion: `${assertion.evaluator.engine}@${assertion.evaluator.version}`,
    confidence: assertion.confidence ?? 0.8,
    overridable: verdict !== 'BLOCK' && assertion.status !== 'REQUIRES_VERIFICATION',
    recoveryConditions: assertion.remediationHints?.map((hint) => ({
      code: 'REMEDIATION',
      description: hint,
    })),
    createdAt: new Date().toISOString(),
  };
}

function mapStatusToGuardianVerdict(
  assertion: ConstraintAssertion,
): Rfc001ConstraintAssertion['verdict'] {
  switch (assertion.status) {
    case 'BLOCK':
      return 'BLOCK';
    case 'WARNING':
      return 'WARNING';
    case 'PASS':
      return 'PASS';
    case 'REQUIRES_VERIFICATION':
      return isSafetyCritical(assertion) ? 'BLOCK' : 'UNKNOWN';
    case 'UNKNOWN':
    default:
      return 'UNKNOWN';
  }
}

function isSafetyCritical(assertion: ConstraintAssertion): boolean {
  if (assertion.severity === 'CRITICAL' || assertion.severity === 'HIGH') {
    return /ROAD|HAZARD|WEATHER|FERRY|SAFETY|FROAD|CLOSED|ALERT/i.test(
      assertion.constraintType,
    );
  }
  return false;
}

function inferActor(constraintType: string): 'ABU' | 'DRDRE' {
  if (/LOAD|FATIGUE|PACE|DRIVE|STRESS|SCHEDULE/i.test(constraintType)) {
    return 'DRDRE';
  }
  return 'ABU';
}

export function mapCanonicalAssertionsToGuardianBatch(input: {
  assertions: ConstraintAssertion[];
  workspaceId: string;
  targetCandidateId: string;
}): Rfc001ConstraintAssertion[] {
  return input.assertions
    .filter((a) => a.status !== 'PASS')
    .map((assertion) =>
      mapCanonicalAssertionToGuardian({
        assertion,
        workspaceId: input.workspaceId,
        targetCandidateId: input.targetCandidateId,
      }),
    );
}
