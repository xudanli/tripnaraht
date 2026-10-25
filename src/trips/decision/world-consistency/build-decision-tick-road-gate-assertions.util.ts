/**
 * Map Look→Authority tick materialization → Gate ConstraintAssertion[].
 * Pure; no global sync.
 */

import type { ConstraintAssertion } from '../../../decision-runtime/constraints/contracts/constraint-assertion';
import type { DecisionTickRoadMaterialization } from './look-road-authority-bridge.types';

export const DECISION_TICK_ROAD_GATE_ENGINE = 'decision-tick-road-gate' as const;
export const DECISION_TICK_ROAD_GATE_VERSION = 'p0-1@v1' as const;

export function buildDecisionTickRoadGateAssertions(
  materialization: DecisionTickRoadMaterialization,
): ConstraintAssertion[] {
  const m = materialization;
  const sv = m.sourceVersion;
  const evidenceRefs = [sv.evidenceId, `tick:${m.tickId}`, `version:${sv.version}`];

  const base = {
    scope: {
      tripId: m.tripId,
      roadSegmentIds: m.segmentId ? [m.segmentId] : [m.roadId],
    },
    evidenceRefs,
    evaluator: {
      engine: DECISION_TICK_ROAD_GATE_ENGINE,
      version: DECISION_TICK_ROAD_GATE_VERSION,
      ruleId: `look_road_${m.gateDisposition}`,
    },
    confidence: m.authority.kind === 'RESOLVED' ? 0.9 : 0.4,
  };

  if (m.gateDisposition === 'ALLOW_OPEN') {
    return [
      {
        ...base,
        assertionId: `dtr_gate_${m.tickId}_allow`,
        constraintType: 'ROAD_STATUS',
        status: 'PASS',
        severity: 'INFO',
        reasonCode: 'DECISION_TICK_ROAD_OPEN',
        message: `Authority road ${m.roadId}=OPEN (Look hint non-authoritative)`,
        overridable: true,
      },
    ];
  }

  if (m.gateDisposition === 'BLOCK_CLOSED') {
    return [
      {
        ...base,
        assertionId: `dtr_gate_${m.tickId}_block`,
        constraintType: 'ROAD_STATUS',
        status: 'BLOCK',
        severity: 'CRITICAL',
        reasonCode: 'DECISION_TICK_ROAD_CLOSED',
        message: `Authority road ${m.roadId}=CLOSED — same-tick Gate BLOCK`,
        remediationHints: ['REPLACE_SEGMENT', 'DEFER_TO_HUMAN'],
        overridable: false,
      },
    ];
  }

  // NEED_CONFIRM | DEGRADED_UNKNOWN — do not forge OPEN/CLOSED
  return [
    {
      ...base,
      assertionId: `dtr_gate_${m.tickId}_confirm`,
      constraintType: 'ROAD_STATUS',
      status: 'REQUIRES_VERIFICATION',
      severity: 'HIGH',
      reasonCode: 'DECISION_TICK_ROAD_UNVERIFIED',
      message: `Road ${m.roadId} authority ${m.roadStatus} — Gate NEED_CONFIRM (Look must not seal status)`,
      remediationHints: ['ASK_USER', 'RETRY_AUTHORITY_FETCH'],
      overridable: true,
    },
  ];
}
