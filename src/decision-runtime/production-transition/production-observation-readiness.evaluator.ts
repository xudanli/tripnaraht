/**
 * Dual-gate observation readiness — duration + volume + coverage + hard redlines.
 */

import type { ProductionObservationReport } from './production-observation.evaluator';
import {
  PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS,
  PRODUCTION_OBSERVATION_VOLUME_THRESHOLDS,
  type ProductionObservationVolumeSnapshot,
} from './production-observation-volume.catalog';
import type { ProductionObservationTimeWindowView } from './production-observation-time-window.util';
import { resolveProductionTransitionPhase } from './production-transition-phase.catalog';

export interface ProductionObservationVolumeCheck {
  metricId: string;
  label: string;
  minValue: number;
  actualValue: number | undefined;
  pass: boolean;
  detail: string;
}

export interface ProductionObservationReadiness {
  schemaId: 'tripnara.production_observation_readiness@v1';
  generatedAt: string;
  phase: ReturnType<typeof resolveProductionTransitionPhase>;
  observationDurationSatisfied: boolean;
  observationVolumeSatisfied: boolean;
  observationCoverageSatisfied: boolean;
  hardRedlinesPassed: boolean;
  observationReady: boolean;
  durationDetail: string;
  coverageDetail: string;
  volumeChecks: ProductionObservationVolumeCheck[];
  volumeBlockers: string[];
  coverageBlockers: string[];
  redlineBlockers: string[];
  disposition: 'PASS' | 'PASS_WITH_CONDITIONS' | 'FAIL' | 'INCOMPLETE';
  nextActions: string[];
}

function redlineBlockers(report: ProductionObservationReport): string[] {
  const blockers: string[] = [];
  for (const m of report.metrics) {
    if (m.disposition === 'FAIL') blockers.push(m.metricId);
  }
  if (report.bypassEntryPoints.length > 0) {
    blockers.push(`trigger-bypass:${report.bypassEntryPoints.length}`);
  }
  return blockers;
}

export function evaluateProductionObservationReadiness(
  report: ProductionObservationReport,
  timeWindow: ProductionObservationTimeWindowView,
  volume?: ProductionObservationVolumeSnapshot,
  options?: { legacyFallbackDrillPass?: boolean },
): ProductionObservationReadiness {
  const volumeValues: Record<string, number | undefined> = {
    'volume.formal-trigger-requests': volume?.formalTriggerRequests,
    'volume.canonical-shadow-dispatches': volume?.canonicalShadowDispatches,
    'volume.constraint-comparisons': volume?.constraintComparisons,
    'volume.authorization-evaluations': volume?.authorizationEvaluations,
    'volume.effective-plan-executions': volume?.effectivePlanExecutions,
    'volume.monitoring-events': volume?.monitoringEvents,
  };

  const volumeChecks: ProductionObservationVolumeCheck[] =
    PRODUCTION_OBSERVATION_VOLUME_THRESHOLDS.map((t) => {
      const actualValue = volumeValues[t.metricId];
      const pass = actualValue !== undefined && actualValue >= t.minValue;
      return {
        metricId: t.metricId,
        label: t.label,
        minValue: t.minValue,
        actualValue,
        pass,
        detail:
          actualValue === undefined
            ? `pending (${t.collectionHint})`
            : `${actualValue}/${t.minValue}`,
      };
    });

  const volumeBlockers = volumeChecks.filter((c) => !c.pass).map((c) => c.metricId);

  const coverageBlockers: string[] = [];
  const scenarios = volume?.coreScenariosCovered ?? 0;
  const destinations = volume?.destinationPacksCovered ?? 0;
  const drills =
    volume?.fallbackDrillsCompleted ??
    (options?.legacyFallbackDrillPass ? 1 : 0);

  if (scenarios < PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.coreScenariosMin) {
    coverageBlockers.push(
      `core-scenarios:${scenarios}/${PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.coreScenariosMin}`,
    );
  }
  if (destinations < PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.destinationPacksMin) {
    coverageBlockers.push(
      `destination-packs:${destinations}/${PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.destinationPacksMin}`,
    );
  }
  if (drills < PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.fallbackDrillsMin) {
    coverageBlockers.push(`fallback-drills:${drills}/1`);
  }

  const redlineBlockersList = redlineBlockers(report);

  const observationDurationSatisfied = timeWindow.timePass;
  const observationVolumeSatisfied = volumeBlockers.length === 0;
  const observationCoverageSatisfied = coverageBlockers.length === 0;
  const hardRedlinesPassed = redlineBlockersList.length === 0;

  const observationReady =
    observationDurationSatisfied &&
    observationVolumeSatisfied &&
    observationCoverageSatisfied &&
    hardRedlinesPassed;

  const durationDetail = `${timeWindow.elapsedDays.toFixed(1)}/${timeWindow.requiredDays}d elapsed · ${timeWindow.archivedDays}/${timeWindow.requiredDays} archived (anchor=${timeWindow.anchorSource})`;

  const coverageDetail = `scenarios ${scenarios}/${PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.coreScenariosMin} · destinations ${destinations}/${PRODUCTION_OBSERVATION_COVERAGE_THRESHOLDS.destinationPacksMin} · drills ${drills}/1`;

  const nextActions: string[] = [];
  if (!observationDurationSatisfied) {
    nextActions.push(
      'Continue daily npm run production-observation:daily until elapsed and archived days both ≥30',
    );
  }
  if (!observationVolumeSatisfied) {
    nextActions.push(
      'Increase production selective traffic or extend observation — low volume cannot auto-pass at day 30',
    );
  }
  if (!observationCoverageSatisfied) {
    nextActions.push('Cover all 7 core constraint scenarios + ≥1 destination pack + fallback drill');
  }
  if (!hardRedlinesPassed) {
    nextActions.push('Resolve redline metric FAIL / trigger bypass before flip sign-off');
  }
  if (observationReady) {
    nextActions.push(
      'Observation dual-gate PASS — proceed to Product / Engineering / SRE sign-off then 10% Canonical flip',
    );
  }

  let disposition: ProductionObservationReadiness['disposition'] = 'INCOMPLETE';
  if (!hardRedlinesPassed) disposition = 'FAIL';
  else if (observationReady) disposition = 'PASS';
  else if (observationDurationSatisfied && !observationVolumeSatisfied) {
    disposition = 'PASS_WITH_CONDITIONS';
  }

  return {
    schemaId: 'tripnara.production_observation_readiness@v1',
    generatedAt: new Date().toISOString(),
    phase: resolveProductionTransitionPhase(),
    observationDurationSatisfied,
    observationVolumeSatisfied,
    observationCoverageSatisfied,
    hardRedlinesPassed,
    observationReady,
    durationDetail,
    coverageDetail,
    volumeChecks,
    volumeBlockers,
    coverageBlockers,
    redlineBlockers: redlineBlockersList,
    disposition,
    nextActions,
  };
}
