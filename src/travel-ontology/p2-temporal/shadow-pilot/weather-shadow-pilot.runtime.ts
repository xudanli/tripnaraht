/**
 * ONT-P2-01 — Weather Production Shadow Pilot runtime
 * READ-ONLY vs P0/P1 authority chain.
 */

import { buildShadowWeatherPredictionRecord } from '../weather-shadow/build-shadow-prediction-record';
import { reconcileWeatherPrediction } from '../reconciliation/reconcile-prediction.util';
import { ShadowControlBoundaryProbe } from './control-boundary.metrics';
import { ShadowPredictionVersionStore } from './prediction-version.store';
import { isOntologyP2WeatherShadowKillSwitchEngaged } from './weather-shadow.kill-switch';
import { isWeatherShadowSelectedTrip } from './weather-shadow-selected-trips';
import type {
  WeatherShadowPilotTickResult,
  WeatherShadowWorldView,
} from './weather-shadow-pilot.types';
import {
  observeContextRevision,
  worldViewToOfflineCase,
} from './weather-world-view.reader';

export function tickWeatherShadowPilot(input: {
  view: WeatherShadowWorldView;
  store: ShadowPredictionVersionStore;
  probe?: ShadowControlBoundaryProbe;
  /** When true, issue a new prediction version even if one is ACTIVE */
  forceNewVersion?: boolean;
  nowMs?: number;
}): WeatherShadowPilotTickResult {
  const probe = input.probe ?? new ShadowControlBoundaryProbe();
  const view = input.view;

  // Observe revision only (no write)
  void observeContextRevision(view);

  if (isOntologyP2WeatherShadowKillSwitchEngaged()) {
    return {
      tripId: view.tripId,
      regionId: view.regionId,
      skipped: { reason: 'KILL_SWITCH' },
      controlBoundary: probe.assertClean('kill_switch'),
    };
  }

  if (view.country !== 'IS') {
    return {
      tripId: view.tripId,
      regionId: view.regionId,
      skipped: { reason: 'COUNTRY_NOT_IS' },
      controlBoundary: probe.assertClean('country'),
    };
  }

  if (!isWeatherShadowSelectedTrip(view.tripId)) {
    return {
      tripId: view.tripId,
      regionId: view.regionId,
      skipped: { reason: 'TRIP_NOT_SELECTED' },
      controlBoundary: probe.assertClean('selected'),
    };
  }

  const offlineCase = worldViewToOfflineCase(view);
  const existing = input.store.active(view.tripId, view.regionId);
  let prediction = existing;
  let superseded: ReturnType<ShadowPredictionVersionStore['publish']>['superseded'];

  const shouldReplace =
    input.forceNewVersion ||
    !existing ||
    existing.record.issuedAt !== view.asOf;

  if (shouldReplace) {
    const record = buildShadowWeatherPredictionRecord(offlineCase, input.nowMs);
    if (!record) {
      return {
        tripId: view.tripId,
        regionId: view.regionId,
        skipped: { reason: 'NO_PREDICTION' },
        prediction: existing,
        controlBoundary: probe.assertClean('no_prediction'),
      };
    }
    if (record.authorityMode !== 'SHADOW') {
      throw new Error('ONT-P2-01: prediction must remain SHADOW');
    }
    if (record.controlSeals.mayCanonicalApply) {
      throw new Error('ONT-P2-01: mayCanonicalApply must be false');
    }
    const published = input.store.publish({ record, at: view.asOf });
    prediction = published.current;
    superseded = published.superseded;
  }

  let reconciliation;
  if (prediction && view.weatherFactSeries.length > 0) {
    reconciliation = reconcileWeatherPrediction({
      prediction: prediction.record,
      case: offlineCase,
      nowMs: input.nowMs ?? Date.parse(view.asOf),
    });
    if (reconciliation.authorityMode !== 'SHADOW') {
      throw new Error('ONT-P2-01: reconciliation must remain SHADOW');
    }
  }

  return {
    tripId: view.tripId,
    regionId: view.regionId,
    prediction,
    superseded,
    reconciliation,
    controlBoundary: probe.assertClean('tick'),
  };
}
