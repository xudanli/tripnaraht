/**
 * Decision Impact probe — answers the scientist question:
 *   If this tick bridge were deleted, would the decision differ?
 *
 * Not a UnifiedWorldState. Compares consumer outcomes with vs without binding.
 */

import type { DecisionTickRoadBinding } from '../world-consistency/decision-tick-road-binding.store';
import { bindLookRoadAuthorityIntoWorldModelContext } from '../world-consistency/bind-look-road-into-world-model-context.util';
import { buildDecisionTickRoadGateAssertions } from '../world-consistency/build-decision-tick-road-gate-assertions.util';
import { injectWorldStoreViolationsIntoCgusCandidates } from '../../../world/inject-world-store-into-cgus-candidates.util';
import type { WorldModelContext } from '../shared/world-model.types';
import type { CGUSCandidate } from '../optimization/cgus-search.service';
import type { DecisionTickPoiMaterialization } from '../world-consistency/poi-authority-bridge.types';
import { bindPoiAuthorityIntoWorldModelContext } from '../world-consistency/bind-poi-into-world-model-context.util';
import { buildDecisionTickPoiGateAssertions } from '../world-consistency/build-decision-tick-poi-gate-assertions.util';

export interface ConsumerDecisionSlice {
  /** What Gate would emit as blocking */
  gateBlocks: boolean;
  gateRequiresVerification: boolean;
  /** CGUS candidate still feasible after world inject */
  cgusFeasible: boolean;
  /** WMC physical road (or POI) view for the subject id */
  worldSees: string;
}

export interface DecisionImpactReport {
  subject: 'ROAD' | 'POI';
  subjectId: string;
  tripId: string;
  tickId: string;
  withoutBridge: ConsumerDecisionSlice;
  withBridge: ConsumerDecisionSlice;
  /** True iff deleting the bridge would change Gate or CGUS outcome */
  decisionWouldDifferIfBridgeDeleted: boolean;
  notes: string[];
}

function stubCgusCandidate(tripId: string): CGUSCandidate {
  return {
    id: 'impact_probe',
    plan: { tripId, routeDirectionId: 'rd', segments: [] },
    constraintViolations: [],
    feasible: true,
  };
}

function roadWorldOpen(roadId: string): WorldModelContext {
  return {
    physical: {
      demEvidence: [
        {
          segmentId: 'seg',
          elevationProfile: [0],
          cumulativeAscent: 0,
          maxSlopePct: 0,
          rollingAscent3Days: 0,
          fatigueIndex: 0,
          violation: 'NONE',
          explanation: 'stub',
        },
      ],
      roadStates: [{ roadId, status: 'OPEN' }],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 7,
    },
    human: {
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 20,
      riskTolerance: 'MEDIUM',
      preferredPace: 'MEDIUM',
    } as WorldModelContext['human'],
    routeDirection: {
      id: 'rd',
      name: 'stub',
    } as WorldModelContext['routeDirection'],
  };
}

function sliceFromAssertions(
  assertions: Array<{ status: string }>,
  worldSees: string,
  cgusFeasible: boolean,
): ConsumerDecisionSlice {
  return {
    gateBlocks: assertions.some((a) => a.status === 'BLOCK'),
    gateRequiresVerification: assertions.some(
      (a) => a.status === 'REQUIRES_VERIFICATION',
    ),
    cgusFeasible,
    worldSees,
  };
}

/**
 * Road CLOSED impact: without binding consumers stay OPEN/feasible;
 * with binding Gate BLOCK + CGUS HARD.
 */
export function measureRoadClosedDecisionImpact(input: {
  binding: DecisionTickRoadBinding;
  /** Baseline world before tick overlay (defaults to OPEN) */
  baselineWorld?: WorldModelContext;
}): DecisionImpactReport {
  const m = input.binding.materialization;
  const baseline = input.baselineWorld ?? roadWorldOpen(m.roadId);
  const withoutWorld = baseline;
  const withWorld = bindLookRoadAuthorityIntoWorldModelContext(baseline, m);

  const withoutGate = sliceFromAssertions(
    [],
    String(
      withoutWorld.physical.roadStates.find(
        (r) => r.roadId.toUpperCase() === m.roadId,
      )?.status ?? 'ABSENT',
    ),
    true,
  );

  const withAssertions = buildDecisionTickRoadGateAssertions(m);
  const withInjected = injectWorldStoreViolationsIntoCgusCandidates(
    [stubCgusCandidate(m.tripId)],
    input.binding.constraintSnapshot,
  );
  const withGate = sliceFromAssertions(
    withAssertions,
    String(
      withWorld.physical.roadStates.find(
        (r) => r.roadId.toUpperCase() === m.roadId,
      )?.status ?? 'ABSENT',
    ),
    withInjected[0]?.feasible !== false,
  );

  const notes: string[] = [];
  if (withoutGate.worldSees !== withGate.worldSees) {
    notes.push(
      `WMC road ${withoutGate.worldSees} → ${withGate.worldSees}`,
    );
  }
  if (withoutGate.gateBlocks !== withGate.gateBlocks) {
    notes.push(
      `Gate BLOCK ${withoutGate.gateBlocks} → ${withGate.gateBlocks}`,
    );
  }
  if (withoutGate.cgusFeasible !== withGate.cgusFeasible) {
    notes.push(
      `CGUS feasible ${withoutGate.cgusFeasible} → ${withGate.cgusFeasible}`,
    );
  }

  const decisionWouldDifferIfBridgeDeleted =
    withoutGate.gateBlocks !== withGate.gateBlocks ||
    withoutGate.gateRequiresVerification !==
      withGate.gateRequiresVerification ||
    withoutGate.cgusFeasible !== withGate.cgusFeasible ||
    withoutGate.worldSees !== withGate.worldSees;

  return {
    subject: 'ROAD',
    subjectId: m.roadId,
    tripId: m.tripId,
    tickId: m.tickId,
    withoutBridge: withoutGate,
    withBridge: withGate,
    decisionWouldDifferIfBridgeDeleted,
    notes,
  };
}

function poiWorldOpen(poiId: string): WorldModelContext {
  const w = roadWorldOpen('F000');
  return {
    ...w,
    physical: {
      ...w.physical,
      poiOperationalStates: [{ poiId, open: true, status: 'OPEN' }],
    },
  };
}

/** POI CLOSED impact: Gate BLOCK + WMC open flag flip (CGUS n/a). */
export function measurePoiClosedDecisionImpact(input: {
  materialization: DecisionTickPoiMaterialization;
  baselineWorld?: WorldModelContext;
}): DecisionImpactReport {
  const m = input.materialization;
  const baseline = input.baselineWorld ?? poiWorldOpen(m.poiId);
  const withoutWorld = baseline;
  const withWorld = bindPoiAuthorityIntoWorldModelContext(baseline, m);

  const withoutGate = sliceFromAssertions(
    [],
    String(
      withoutWorld.physical.poiOperationalStates?.find(
        (p) => p.poiId === m.poiId,
      )?.status ?? 'ABSENT',
    ),
    true, // CGUS does not consume POI tick
  );

  const withAssertions = buildDecisionTickPoiGateAssertions(m);
  const withStatus =
    withWorld.physical.poiOperationalStates?.find((p) => p.poiId === m.poiId)
      ?.status ?? 'ABSENT';
  const withGate = sliceFromAssertions(
    withAssertions,
    String(withStatus),
    true,
  );

  const notes: string[] = [];
  if (withoutGate.worldSees !== withGate.worldSees) {
    notes.push(`WMC poi ${withoutGate.worldSees} → ${withGate.worldSees}`);
  }
  if (withoutGate.gateBlocks !== withGate.gateBlocks) {
    notes.push(
      `Gate BLOCK ${withoutGate.gateBlocks} → ${withGate.gateBlocks}`,
    );
  }
  notes.push('CGUS n/a for POI cell (by design)');

  const decisionWouldDifferIfBridgeDeleted =
    withoutGate.gateBlocks !== withGate.gateBlocks ||
    withoutGate.gateRequiresVerification !==
      withGate.gateRequiresVerification ||
    withoutGate.worldSees !== withGate.worldSees;

  return {
    subject: 'POI',
    subjectId: m.poiId,
    tripId: m.tripId,
    tickId: m.tickId,
    withoutBridge: withoutGate,
    withBridge: withGate,
    decisionWouldDifferIfBridgeDeleted,
    notes,
  };
}

export function formatDecisionImpactReport(
  report: DecisionImpactReport,
): string[] {
  return [
    `subject\t${report.subject}\t${report.subjectId}\ttick=${report.tickId}`,
    `without\tworld=${report.withoutBridge.worldSees}\tgateBlock=${report.withoutBridge.gateBlocks}\tcgusFeasible=${report.withoutBridge.cgusFeasible}`,
    `with\tworld=${report.withBridge.worldSees}\tgateBlock=${report.withBridge.gateBlocks}\tcgusFeasible=${report.withBridge.cgusFeasible}`,
    `impact_if_bridge_deleted\t${report.decisionWouldDifferIfBridgeDeleted ? 'YES' : 'NO'}`,
    ...report.notes.map((n) => `note\t${n}`),
  ];
}
