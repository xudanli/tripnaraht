/**
 * Same-tick Decision World Consistency evaluator.
 *
 * Goal: answer "do consumers see the same External Reality in this tick?"
 * Not: invent UnifiedWorldState.
 */

import type {
  ConsistencyVerdict,
  DecisionTickConsistencyCell,
  DecisionTickConsistencyReport,
  DecisionTickWorldViews,
  RoadStatusView,
} from './decision-world-consistency.types';
import { DECISION_WORLD_CONSISTENCY_SCHEMA } from './decision-world-consistency.types';

function fmtRoad(v: RoadStatusView | undefined): string {
  return v ?? 'ABSENT';
}

function fmtWind(
  mps: number | null | undefined,
  alert?: string,
  seasonal?: boolean,
): string {
  if (mps == null || !Number.isFinite(mps)) return 'ABSENT';
  const base = seasonal ? `${mps} typical` : String(mps);
  return alert ? `${base} ${alert}` : base;
}

function fmtPoi(v: string | undefined): string {
  return v ?? 'ABSENT';
}

function uniqueStrings(xs: string[]): string[] {
  return [...new Set(xs.filter(Boolean))];
}

function roadSourceVersionsEqual(views: DecisionTickWorldViews): boolean {
  const a = views.abuSees.roadSourceVersion;
  const c = views.cgusSees.roadSourceVersion;
  const g = views.gateSees.roadSourceVersion;
  if (!a || !c || !g) return false;
  return (
    JSON.stringify(a) === JSON.stringify(c) &&
    JSON.stringify(c) === JSON.stringify(g)
  );
}

function roadCell(views: DecisionTickWorldViews): DecisionTickConsistencyCell {
  const reality = fmtRoad(views.reality.road);
  const canonical = fmtRoad(views.canonical.road);
  const constraint = fmtRoad(views.constraintStore.road);
  const wmc = fmtRoad(views.worldModelContext.road);
  const abu = fmtRoad(views.abuSees.road);
  const cgus = fmtRoad(views.cgusSees.road);
  const gate = fmtRoad(views.gateSees.road);
  const nep = fmtRoad(views.neptuneSees?.road);

  const notes: string[] = [];
  if (views.lookAssertion?.impliesRoadClosedHint) {
    notes.push(
      `Look predicate=${views.lookAssertion.predicate} authoritative=${views.lookAssertion.authoritative} (must not be road.status SSOT)`,
    );
  }

  const versionsAligned = roadSourceVersionsEqual(views);
  if (
    views.abuSees.roadSourceVersion ||
    views.cgusSees.roadSourceVersion ||
    views.gateSees.roadSourceVersion
  ) {
    if (!versionsAligned) {
      notes.push('Abu/CGUS/Gate road sourceVersion mismatch');
    }
  }

  // Core FAIL: reality CLOSED but any of Abu/CGUS still OPEN
  const abuCgusOpenWhileClosed =
    reality === 'CLOSED' && (abu === 'OPEN' || cgus === 'OPEN');

  // Gate CLOSED while Abu OPEN — classic split-brain
  const gateAbuSplit = gate === 'CLOSED' && abu === 'OPEN';

  // Look must not force CLOSED when authority says OPEN
  const lookForcedClosed =
    reality === 'OPEN' &&
    views.lookAssertion?.impliesRoadClosedHint === true &&
    (abu === 'CLOSED' || cgus === 'CLOSED' || constraint === 'CLOSED');

  // Authority unavailable: must not forge OPEN as fact
  const unverifiedForgedOpen =
    (reality === 'UNVERIFIED' || reality === 'UNKNOWN') &&
    (views.cgusSees.treatAsOpenFact === true ||
      abu === 'OPEN' ||
      cgus === 'OPEN');

  const alignedClosed =
    reality === 'CLOSED' &&
    abu === 'CLOSED' &&
    cgus === 'CLOSED' &&
    gate === 'CLOSED' &&
    (constraint === 'CLOSED' || constraint === 'ABSENT') &&
    (wmc === 'CLOSED' || wmc === 'ABSENT') &&
    (versionsAligned || !views.abuSees.roadSourceVersion);

  const alignedOpen =
    reality === 'OPEN' &&
    abu === 'OPEN' &&
    cgus === 'OPEN' &&
    gate === 'OPEN' &&
    !lookForcedClosed &&
    (versionsAligned || !views.abuSees.roadSourceVersion);

  const alignedUnverified =
    (reality === 'UNVERIFIED' || reality === 'UNKNOWN') &&
    (abu === 'UNVERIFIED' || abu === 'UNKNOWN') &&
    (cgus === 'UNVERIFIED' || cgus === 'UNKNOWN') &&
    views.cgusSees.treatAsOpenFact === false &&
    (views.gateSees.disposition === 'NEED_CONFIRM' ||
      gate === 'UNVERIFIED' ||
      gate === 'UNKNOWN') &&
    (versionsAligned || !views.abuSees.roadSourceVersion);

  let result: ConsistencyVerdict = 'FAIL';
  if (abuCgusOpenWhileClosed || gateAbuSplit || lookForcedClosed || unverifiedForgedOpen) {
    result = 'FAIL';
  } else if (
    views.abuSees.roadSourceVersion &&
    !versionsAligned
  ) {
    result = 'FAIL';
  } else if (alignedClosed || alignedOpen || alignedUnverified) {
    result = 'PASS';
  } else if (
    reality === 'CLOSED' &&
    (abu !== 'CLOSED' || cgus !== 'CLOSED' || gate !== 'CLOSED')
  ) {
    result = 'FAIL';
  } else {
    result = 'FAIL';
  }

  if (abuCgusOpenWhileClosed) {
    notes.push('Reality CLOSED but Abu and/or CGUS still OPEN');
  }
  if (gateAbuSplit) {
    notes.push('Gate sees CLOSED while Abu sees OPEN');
  }
  if (lookForcedClosed) {
    notes.push('Look hint must not seal road CLOSED when authority is OPEN');
  }
  if (unverifiedForgedOpen) {
    notes.push('Authority UNAVAILABLE must not forge OPEN');
  }

  return {
    key: 'road',
    reality,
    canonical,
    constraint,
    worldModelContext: wmc,
    abuSees: abu,
    cgusSees: cgus,
    gateSees: gate,
    neptuneSees: nep,
    result,
    divergenceNotes: uniqueStrings(notes),
  };
}

function windCell(views: DecisionTickWorldViews): DecisionTickConsistencyCell {
  const reality = fmtWind(views.reality.windMps, views.reality.windAlert);
  const canonical = fmtWind(
    views.canonical.windMps,
    views.canonical.windAlert,
  );
  const constraint = views.constraintStore.weatherStressed
    ? 'STRESSED'
    : 'ABSENT';
  const seasonal = views.worldModelContext.windFromSeasonalTypicalMps;
  const evidence = views.worldModelContext.windFromWeatherEvidenceMps;
  const wmc =
    evidence != null
      ? fmtWind(evidence)
      : seasonal != null
        ? fmtWind(seasonal, undefined, true)
        : 'ABSENT';

  const abu = 'n/a';
  const cgus = fmtWind(
    views.cgusSees.windMps,
    undefined,
    views.cgusSees.windSource === 'seasonal_typical',
  );
  const gate = fmtWind(views.gateSees.windMps, views.gateSees.windAlert);
  const nep = views.neptuneSees?.windAlert
    ? String(views.neptuneSees.windAlert)
    : 'ABSENT';

  const notes: string[] = [];
  const authorityMps = views.reality.windMps;
  const cgusMps = views.cgusSees.windMps;

  let result: ConsistencyVerdict = 'PASS';
  if (
    authorityMps != null &&
    Number.isFinite(authorityMps) &&
    authorityMps >= 20 &&
    cgusMps != null &&
    Number.isFinite(cgusMps) &&
    Math.abs(cgusMps - authorityMps) > 5 &&
    views.cgusSees.windSource === 'seasonal_typical'
  ) {
    result = 'FAIL';
    notes.push(
      `CGUS used seasonal typical ${cgusMps} m/s while authority wind is ${authorityMps} m/s`,
    );
  }
  if (
    gate !== 'ABSENT' &&
    cgus !== 'ABSENT' &&
    views.cgusSees.windSource === 'seasonal_typical' &&
    views.gateSees.windMps != null &&
    views.cgusSees.windMps != null &&
    Math.abs(views.gateSees.windMps - views.cgusSees.windMps) > 5
  ) {
    result = 'FAIL';
    notes.push('Gate and CGUS wind disagree by >5 m/s');
  }

  return {
    key: 'wind',
    reality,
    canonical,
    constraint,
    worldModelContext: wmc,
    abuSees: abu,
    cgusSees: cgus,
    gateSees: gate,
    neptuneSees: nep,
    result,
    divergenceNotes: uniqueStrings(notes),
  };
}

function poiCell(views: DecisionTickWorldViews): DecisionTickConsistencyCell {
  const reality = fmtPoi(views.reality.poi);
  const canonical = fmtPoi(views.canonical.poi);
  const constraint = 'n/a';
  const wmc = fmtPoi(views.worldModelContext.poi);
  const abu = 'n/a';
  const cgus = 'n/a';
  const gate = fmtPoi(views.gateSees.poi);
  const nep = fmtPoi(views.neptuneSees?.poi) === 'ABSENT' ? 'ABSENT' : fmtPoi(views.neptuneSees?.poi);

  const notes: string[] = [];
  let result: ConsistencyVerdict = 'PASS';

  // Authority UNAVAILABLE → UNVERIFIED everywhere is aligned (do not forge)
  if (reality === 'UNVERIFIED') {
    if (canonical === 'OPEN' || wmc === 'OPEN' || gate === 'OPEN') {
      result = 'FAIL';
      notes.push('POI UNVERIFIED but a consumer forged OPEN');
    }
    if (canonical === 'CLOSED' || wmc === 'CLOSED' || gate === 'CLOSED') {
      result = 'FAIL';
      notes.push('POI UNVERIFIED but a consumer forged CLOSED');
    }
  } else if (reality === 'CLOSED') {
    if (canonical !== 'CLOSED' && gate !== 'CLOSED') {
      result = 'FAIL';
      notes.push('POI CLOSED in reality but Canonical/Gate not CLOSED');
    }
    if (wmc === 'OPEN') {
      result = 'FAIL';
      notes.push('POI CLOSED in reality but WorldModelContext still OPEN');
    }
  } else if (reality === 'OPEN') {
    if (canonical === 'CLOSED' || wmc === 'CLOSED' || gate === 'CLOSED') {
      result = 'FAIL';
      notes.push('POI OPEN in reality but a consumer still CLOSED');
    }
  }

  const csv = views.canonical.poiSourceVersion;
  const wsv = views.worldModelContext.poiSourceVersion;
  const gsv = views.gateSees.poiSourceVersion;
  if (csv && wsv && gsv) {
    if (
      JSON.stringify(csv) !== JSON.stringify(wsv) ||
      JSON.stringify(wsv) !== JSON.stringify(gsv)
    ) {
      result = 'FAIL';
      notes.push('Canonical/WMC/Gate poi sourceVersion mismatch');
    }
  }

  return {
    key: 'poi',
    reality,
    canonical,
    constraint,
    worldModelContext: wmc,
    abuSees: abu,
    cgusSees: cgus,
    gateSees: gate,
    neptuneSees: nep,
    result,
    divergenceNotes: uniqueStrings(notes),
  };
}

function cellsForScenario(
  views: DecisionTickWorldViews,
): DecisionTickConsistencyCell[] {
  switch (views.scenarioId) {
    case 'ROAD_CLOSED':
      return [roadCell(views)];
    case 'STRONG_WIND':
      return [windCell(views)];
    case 'POI_CLOSED':
      return [poiCell(views)];
    default:
      return [];
  }
}

function formatTableRow(cell: DecisionTickConsistencyCell, tickId: string): string {
  return [
    tickId,
    cell.reality,
    cell.canonical,
    cell.constraint,
    cell.worldModelContext,
    cell.abuSees,
    cell.cgusSees,
    cell.gateSees,
    cell.result,
  ].join('\t');
}

/**
 * Evaluate one Decision Tick's consumer views for External Reality consistency.
 */
export function evaluateDecisionTickConsistency(
  views: DecisionTickWorldViews,
): DecisionTickConsistencyReport {
  const cells = cellsForScenario(views);
  const overall: ConsistencyVerdict = cells.some((c) => c.result === 'FAIL')
    ? 'FAIL'
    : 'PASS';

  return {
    schemaId: DECISION_WORLD_CONSISTENCY_SCHEMA,
    tickId: views.tickId,
    scenarioId: views.scenarioId,
    group: views.group,
    overall,
    cells,
    tableRows: [
      'Tick\tReality\tCanonical\tConstraint\tWorldModelContext\tAbu sees\tCGUS sees\tGate sees\tResult',
      ...cells.map((c) => formatTableRow(c, views.tickId)),
    ],
  };
}
