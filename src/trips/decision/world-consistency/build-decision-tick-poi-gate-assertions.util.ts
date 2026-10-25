/**
 * Map POI authority tick materialization → Gate ConstraintAssertion[].
 * Pure; no global sync.
 */

import type { ConstraintAssertion } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import type { DecisionTickPoiMaterialization } from './poi-authority-bridge.types';

export const DECISION_TICK_POI_GATE_ENGINE = 'decision-tick-poi-gate' as const;
export const DECISION_TICK_POI_GATE_VERSION = 'p0-3@v1' as const;

export function buildDecisionTickPoiGateAssertions(
  materialization: DecisionTickPoiMaterialization,
): ConstraintAssertion[] {
  const m = materialization;
  const sv = m.sourceVersion;
  const evidenceRefs = [
    sv.evidenceId,
    `tick:${m.tickId}`,
    `version:${sv.version}`,
  ];

  const base = {
    scope: {
      tripId: m.tripId,
      activityId: m.poiId,
    },
    evidenceRefs,
    evaluator: {
      engine: DECISION_TICK_POI_GATE_ENGINE,
      version: DECISION_TICK_POI_GATE_VERSION,
      ruleId: `poi_authority_${m.gateDisposition}`,
    },
    confidence: m.authority.kind === 'RESOLVED' ? 0.9 : 0.4,
  };

  if (m.gateDisposition === 'ALLOW_OPEN') {
    return [
      {
        ...base,
        assertionId: `dtp_gate_${m.tickId}_allow`,
        constraintType: 'POI_STATUS',
        status: 'PASS',
        severity: 'INFO',
        reasonCode: 'DECISION_TICK_POI_OPEN',
        message: `Authority POI ${m.poiId}=OPEN (field hint non-authoritative)`,
        overridable: true,
      },
    ];
  }

  if (m.gateDisposition === 'BLOCK_CLOSED') {
    return [
      {
        ...base,
        assertionId: `dtp_gate_${m.tickId}_block`,
        constraintType: 'POI_STATUS',
        status: 'BLOCK',
        severity: 'CRITICAL',
        reasonCode: 'DECISION_TICK_POI_CLOSED',
        message: `Authority POI ${m.poiId}=CLOSED — same-tick Gate BLOCK`,
        remediationHints: ['REPLACE_POI', 'DEFER_TO_HUMAN'],
        overridable: false,
      },
    ];
  }

  return [
    {
      ...base,
      assertionId: `dtp_gate_${m.tickId}_confirm`,
      constraintType: 'POI_STATUS',
      status: 'REQUIRES_VERIFICATION',
      severity: 'HIGH',
      reasonCode: 'DECISION_TICK_POI_UNVERIFIED',
      message: `POI ${m.poiId} authority ${m.poiStatus} — Gate NEED_CONFIRM (do not forge open/closed)`,
      remediationHints: ['ASK_USER', 'RETRY_AUTHORITY_FETCH'],
      overridable: true,
    },
  ];
}

export function buildDecisionTickPoiGateAssertionsForTrip(
  materializations: DecisionTickPoiMaterialization[],
): ConstraintAssertion[] {
  return materializations.flatMap(buildDecisionTickPoiGateAssertions);
}
