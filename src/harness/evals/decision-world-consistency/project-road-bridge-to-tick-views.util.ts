/**
 * Project Look→Authority tick materialization into DecisionTickWorldViews
 * for same-tick consistency harness.
 */

import type { DecisionTickWorldViews } from '../../../harness/evals/decision-world-consistency/decision-world-consistency.types';
import type { DecisionTickRoadMaterialization } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';
import type { RoadStatusView } from '../../../harness/evals/decision-world-consistency/decision-world-consistency.types';

function toViewStatus(
  status: DecisionTickRoadMaterialization['roadStatus'],
): RoadStatusView {
  return status;
}

function constraintView(
  m: DecisionTickRoadMaterialization,
): RoadStatusView {
  if (m.roadStatus === 'UNVERIFIED') return 'UNVERIFIED';
  if (m.constraintField.state === 'CLOSED') return 'CLOSED';
  if (m.constraintField.state === 'OPEN') return 'OPEN';
  if (m.constraintField.state === 'RESTRICTED') return 'RESTRICTED';
  return 'UNKNOWN';
}

export function projectRoadBridgeToTickViews(input: {
  materialization: DecisionTickRoadMaterialization;
  /** Authority conclusion used as Reality for harness (not Look hint) */
  realityRoad: RoadStatusView;
}): DecisionTickWorldViews {
  const m = input.materialization;
  const road = toViewStatus(m.roadStatus);
  const sv = m.sourceVersion;

  return {
    tickId: m.tickId,
    scenarioId: 'ROAD_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { road: input.realityRoad },
    canonical: { road, snapshotId: `ws_${m.tickId}` },
    constraintStore: { road: constraintView(m) },
    worldModelContext: { road },
    lookAssertion: {
      predicate: m.lookHint.predicate,
      authoritative: m.lookHint.authoritative,
      impliesRoadClosedHint: true,
    },
    abuSees: { road, roadSourceVersion: sv },
    cgusSees: {
      road,
      treatAsOpenFact: m.cgusSees.treatAsOpenFact,
      roadSourceVersion: sv,
      windMps: null,
      windSource: 'absent',
    },
    gateSees: {
      road,
      disposition: m.gateDisposition,
      roadSourceVersion: sv,
      snapshotId: `ws_${m.tickId}`,
    },
    neptuneSees: { road },
  };
}
