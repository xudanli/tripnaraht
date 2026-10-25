/**
 * Project tick road binding into consumer views for same-tick probe matrix.
 */

import type { DecisionTickRoadBinding } from './decision-tick-road-binding.store';
import type { DecisionRoadSourceVersion } from './look-road-authority-bridge.types';
import { injectWorldStoreViolationsIntoCgusCandidates } from '../../../world/inject-world-store-into-cgus-candidates.util';
import type { CGUSCandidate } from '../optimization/cgus-search.service';

export interface DecisionTickRoadConsumerProbe {
  tickId: string;
  tripId: string;
  roadId: string;
  reality: string;
  lookAuthoritative: false;
  lookPredicate: string;
  constraint: string;
  physical: string;
  abuSees: string;
  cgusSees: string;
  gateSees: string;
  gateDisposition: string;
  cgusTreatAsOpenFact: boolean;
  abuSourceVersion: DecisionRoadSourceVersion;
  cgusSourceVersion: DecisionRoadSourceVersion;
  gateSourceVersion: DecisionRoadSourceVersion;
  sourceVersionsEqual: boolean;
  cgusHardRoadViolationInjected: boolean;
}

export function probeDecisionTickRoadConsumers(
  binding: DecisionTickRoadBinding,
): DecisionTickRoadConsumerProbe {
  const m = binding.materialization;
  const sv = m.sourceVersion;
  const sourceVersionsEqual =
    JSON.stringify(m.abuSees.sourceVersion) ===
      JSON.stringify(m.cgusSees.sourceVersion) &&
    JSON.stringify(m.cgusSees.sourceVersion) ===
      JSON.stringify(m.gateSees.sourceVersion);

  const stubCandidate: CGUSCandidate = {
    id: 'probe',
    plan: { tripId: m.tripId, routeDirectionId: 'rd', segments: [] },
    constraintViolations: [],
    feasible: true,
  };
  const injected = injectWorldStoreViolationsIntoCgusCandidates(
    [stubCandidate],
    binding.constraintSnapshot,
  );
  const hardRoad = (injected[0]?.constraintViolations ?? []).some(
    (v) => v.type.startsWith('WORLD_ROAD_') && v.severity === 'HARD',
  );

  const reality =
    m.authority.kind === 'UNAVAILABLE'
      ? 'UNVERIFIED'
      : m.authority.status;

  return {
    tickId: m.tickId,
    tripId: m.tripId,
    roadId: m.roadId,
    reality,
    lookAuthoritative: false,
    lookPredicate: m.lookHint.predicate,
    constraint: String(
      binding.constraintSnapshot.roads[m.roadId]?.state ?? 'ABSENT',
    ),
    physical: String(m.physicalRoadState.status),
    abuSees: m.abuSees.road,
    cgusSees: m.cgusSees.road,
    gateSees: m.gateSees.road,
    gateDisposition: m.gateDisposition,
    cgusTreatAsOpenFact: m.cgusSees.treatAsOpenFact,
    abuSourceVersion: m.abuSees.sourceVersion,
    cgusSourceVersion: m.cgusSees.sourceVersion,
    gateSourceVersion: m.gateSees.sourceVersion,
    sourceVersionsEqual,
    cgusHardRoadViolationInjected: hardRoad,
  };
}

export function formatRoadConsumerProbeTable(
  probe: DecisionTickRoadConsumerProbe,
): string[] {
  const header =
    'Tick\tReality\tConstraint\tPhysical\tAbu\tCGUS\tGate\tVersionsEqual\tResult';
  const versionsOk = probe.sourceVersionsEqual;
  let pass = versionsOk;
  if (probe.reality === 'CLOSED') {
    pass =
      pass &&
      probe.abuSees === 'CLOSED' &&
      probe.cgusSees === 'CLOSED' &&
      probe.gateSees === 'CLOSED' &&
      probe.cgusHardRoadViolationInjected;
  } else if (probe.reality === 'OPEN') {
    pass =
      pass &&
      probe.abuSees === 'OPEN' &&
      probe.cgusSees === 'OPEN' &&
      probe.gateSees === 'OPEN' &&
      !probe.cgusHardRoadViolationInjected &&
      probe.lookAuthoritative === false;
  } else {
    // UNAVAILABLE / UNKNOWN
    pass =
      pass &&
      (probe.abuSees === 'UNVERIFIED' || probe.abuSees === 'UNKNOWN') &&
      probe.cgusTreatAsOpenFact === false &&
      probe.gateDisposition === 'NEED_CONFIRM';
  }

  const row = [
    probe.tickId,
    probe.reality,
    probe.constraint,
    probe.physical,
    probe.abuSees,
    probe.cgusSees,
    probe.gateSees,
    versionsOk ? 'YES' : 'NO',
    pass ? 'PASS' : 'FAIL',
  ].join('\t');

  return [header, row];
}
