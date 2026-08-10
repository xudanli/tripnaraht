/**
 * Closed loop: weather L2 DecisionScope stamp on trip.metadata
 * → buildTripWorldStateFromPrismaTrip signals
 * → resolveDecisionScopeForGateway
 * → evaluateDecisionScopeBoundRun (Gateway Verification util)
 *
 * Run:
 *   npx jest src/harness/evals/vertical-slice/weather-scope-signals-closed-loop.harness.spec.ts
 */

import { buildWeatherActivityDecisionScope } from '../../../decision-runtime/builders/build-weather-activity-decision-scope';
import { resolveDecisionScopeForGateway } from '../../../decision-runtime/constraints/resolve-decision-scope-for-gateway.util';
import {
  DECISION_SCOPE_VIOLATION,
  evaluateDecisionScopeBoundRun,
} from '../../../decision-runtime/verification/evaluate-decision-scope.util';
import {
  applyAuthorityDecisionScopeSignalsToWorldSignals,
  buildWeatherOutdoorStormScopeSignals,
  mergeAuthorityDecisionScopeIntoTripMetadata,
  readAuthorityDecisionScopeSignalsFromMetadata,
} from '../../../trips/guardian-decision-core/orchestration/authority-decision-scope-signals.util';
import { buildTripWorldStateFromPrismaTrip } from '../../../trips/readiness/utils/trip-decision-repair-bridge.util';

describe('weather DecisionScope signals closed loop', () => {
  it('metadata → TripWorldState.signals → Gateway binding → Verification', () => {
    const tripId = 'trip_is_closed_loop';
    const snapshotId = 'wss_closed_loop_1';
    const itemId = 'item_day2_hike';

    const decisionScope = buildWeatherActivityDecisionScope({
      snapshotId,
      tripId,
      affectedPlanItemIds: [itemId],
      affectedDayIndex: 1,
    });

    const stamped = buildWeatherOutdoorStormScopeSignals({
      decisionScope,
      worldStateSnapshotId: snapshotId,
      affectedPlanItemIds: [itemId],
      weatherAffectedDayIndex: 1,
      problemId: 'prob_wx_1',
      workspaceId: 'ws_prob_wx_1',
    });

    const metadata = mergeAuthorityDecisionScopeIntoTripMetadata(
      { revision: 17 },
      stamped,
    );
    expect(readAuthorityDecisionScopeSignalsFromMetadata(metadata)?.worldStateSnapshotId).toBe(
      snapshotId,
    );

    const worldState = buildTripWorldStateFromPrismaTrip({
      id: tripId,
      destination: 'IS',
      startDate: new Date('2026-07-17T00:00:00.000Z'),
      endDate: new Date('2026-07-20T00:00:00.000Z'),
      TripDay: [],
      metadata,
    });

    const signals = worldState.signals as unknown as Record<string, unknown>;
    expect(signals.weatherProhibitsOutdoor).toBe('ACTIVITY_PROHIBITED');
    expect(signals.worldStateSnapshotId).toBe(snapshotId);
    expect((signals.decisionScope as { snapshotId: string }).snapshotId).toBe(snapshotId);

    const bound = resolveDecisionScopeForGateway({
      tripId,
      signals,
    });
    expect(bound.decisionScope?.snapshotId).toBe(snapshotId);
    expect(bound.worldStateSnapshotId).toBe(snapshotId);

    const ok = evaluateDecisionScopeBoundRun({
      tripId,
      scope: bound.decisionScope!,
      consumers: [
        { name: 'decision', snapshotId: bound.decisionScope!.snapshotId },
        { name: 'solver', snapshotId: bound.worldStateSnapshotId },
        { name: 'verification', snapshotId: bound.decisionScope!.snapshotId },
      ],
      candidate: {
        actionType: 'REPLACE_ITEM',
        targetObjectIds: [itemId],
      },
    });
    expect(ok.ok).toBe(true);

    const bad = evaluateDecisionScopeBoundRun({
      tripId,
      scope: bound.decisionScope!,
      candidate: {
        actionType: 'MOVE_ITEM',
        targetObjectIds: [itemId],
      },
    });
    expect(bad.ok).toBe(false);
    expect(bad.assertions[0]?.reasonCode).toBe(DECISION_SCOPE_VIOLATION);

    // Flatten helper remains idempotent for ConstraintEngine callers
    const again = applyAuthorityDecisionScopeSignalsToWorldSignals(signals, stamped);
    expect(again.constraintScenarioId).toBe('weather-outdoor-storm');
  });
});
