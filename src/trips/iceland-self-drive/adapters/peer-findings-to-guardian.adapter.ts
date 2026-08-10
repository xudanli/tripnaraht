/**
 * Peer findings → Guardian Rfc001 assertions for Gateway ingress.
 * Calibration only — labels evaluator as contrast peer projection.
 */

import { randomUUID } from 'crypto';
import type { Rfc001ConstraintAssertion } from '../../../trips/guardian-decision-core/contracts/guardian-outputs.types';
import type { PlatformComparableFinding } from '../types/iceland-shadow-vs-platform-contrast.types';

export function peerFindingsToGuardianAssertions(
  tripId: string,
  findings: PlatformComparableFinding[],
): Rfc001ConstraintAssertion[] {
  const now = new Date().toISOString();
  return findings
    .filter((f) => f.status === 'BLOCK' || f.status === 'WARNING')
    .map((f) => ({
      assertionId: `contrast_peer_${f.constraintKey}_${randomUUID().slice(0, 8)}`,
      workspaceId: tripId,
      actor: 'ABU' as const,
      affectedEntityRefs: [],
      affectedPlanItemIds: [],
      verdict: f.status === 'BLOCK' ? ('BLOCK' as const) : ('WARNING' as const),
      constraintCode: f.constraintKey,
      reasonCodes: [f.basis],
      evidenceRefs: f.evidenceRefs,
      ruleVersion: 'platform_comparable_rule_surface@v1+gateway_ingress',
      confidence: 1,
      overridable: false,
      semanticKey: f.constraintKey,
      createdAt: now,
    }));
}
