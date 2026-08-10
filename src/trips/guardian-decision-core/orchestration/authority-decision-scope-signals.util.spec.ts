import {
  applyAuthorityDecisionScopeSignalsToWorldSignals,
  buildWeatherOutdoorStormScopeSignals,
  mergeAuthorityDecisionScopeIntoTripMetadata,
  readAuthorityDecisionScopeSignalsFromMetadata,
  AUTHORITY_DECISION_SCOPE_METADATA_KEY,
} from './authority-decision-scope-signals.util';
import { buildWeatherActivityDecisionScope } from '../../../decision-runtime/builders/build-weather-activity-decision-scope';
import { resolveDecisionScopeForGateway } from '../../../decision-runtime/constraints/resolve-decision-scope-for-gateway.util';

describe('authority-decision-scope-signals', () => {
  const scope = buildWeatherActivityDecisionScope({
    snapshotId: 'wss_1',
    tripId: 'trip_is',
    affectedPlanItemIds: ['item_hike'],
    affectedDayIndex: 1,
  });

  it('round-trips through trip metadata and world signals', () => {
    const stamped = buildWeatherOutdoorStormScopeSignals({
      decisionScope: scope,
      worldStateSnapshotId: 'wss_1',
      affectedPlanItemIds: ['item_hike'],
      weatherAffectedDayIndex: 1,
      problemId: 'prob_1',
      workspaceId: 'ws_1',
    });
    const meta = mergeAuthorityDecisionScopeIntoTripMetadata({ revision: 3 }, stamped);
    expect(meta[AUTHORITY_DECISION_SCOPE_METADATA_KEY]).toBeTruthy();

    const read = readAuthorityDecisionScopeSignalsFromMetadata(meta);
    expect(read?.decisionScope.snapshotId).toBe('wss_1');

    const worldSignals = applyAuthorityDecisionScopeSignalsToWorldSignals(
      { lastUpdatedAt: 't' },
      read,
    );
    const bound = resolveDecisionScopeForGateway({
      tripId: 'trip_is',
      signals: worldSignals,
    });
    expect(bound.decisionScope?.snapshotId).toBe('wss_1');
    expect(bound.decisionScope?.trigger).toBe('WEATHER_ACTIVITY_PROHIBITED');
    expect(bound.worldStateSnapshotId).toBe('wss_1');
  });
});
