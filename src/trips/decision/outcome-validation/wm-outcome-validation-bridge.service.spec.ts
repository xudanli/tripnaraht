/**
 * WM Outcome Validation production bridge — store.put on accept/outcome.
 */

import { DecisionTickRoadBindingStore } from '../world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../world-consistency/look-road-authority-decision-tick.service';
import type { LookRoadAuthorityPort } from '../world-consistency/run-look-road-authority-decision-tick';
import { WmOutcomeValidationBridgeService } from './wm-outcome-validation-bridge.service';
import { WmOutcomeValidationStore } from './wm-outcome-validation.store';

const TRIP = 'trip_ov_bridge_wire';
const ROAD = 'F208';

async function seedClosedRoadBinding() {
  const roadStore = new DecisionTickRoadBindingStore();
  const port: LookRoadAuthorityPort = {
    resolveAuthority: async () => ({
      kind: 'RESOLVED',
      status: 'CLOSED',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_bridge_wire',
      version: 'wire@v1',
    }),
  };
  const svc = new LookRoadAuthorityDecisionTickService(roadStore, port as never);
  await svc.maybeTriggerFromLookObservation({
    tripId: TRIP,
    observationId: 'obs_wire',
    facts: [
      {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
        value: ROAD,
        confidence: 0.9,
        source: 'OCR',
      },
    ],
    tickId: 'tick_wire_road',
  });
  return roadStore;
}

describe('WmOutcomeValidationBridgeService (production wire)', () => {
  it('ACCEPT → put provisional; CGUS outcome → backfill bWasBetter', async () => {
    const roadStore = await seedClosedRoadBinding();
    const store = new WmOutcomeValidationStore();
    const bridge = new WmOutcomeValidationBridgeService(store, roadStore);

    const accept = bridge.onCgusUserAction({
      tripId: TRIP,
      decisionId: 'run:OPTIMIZE:v0',
      userAction: 'ACCEPT',
    });
    expect(accept).not.toBeNull();
    expect(accept!.decisionWithoutBridge.summary).toContain('ALLOW');
    expect(accept!.decisionWithBridge.summary).toContain('BLOCK');
    expect(accept!.verdict.bWasBetter).toBeNull(); // outcome still UNKNOWN
    expect(store.latest(TRIP)?.tickId).toBe('run:OPTIMIZE:v0');

    const outcome = bridge.onCgusOutcome({
      tripId: TRIP,
      decisionId: 'run:OPTIMIZE:v0',
      actualOutcome: { completed: true, safetyIncident: false },
      decisionRegret: 'NONE',
    });
    expect(outcome).not.toBeNull();
    expect(outcome!.outcome.success).toBe('SUCCESS');
    expect(outcome!.experience.regret).toBe(false);
    expect(outcome!.verdict.decisionDiffered).toBe(true);
    expect(outcome!.verdict.bWasBetter).toBe(true);
    expect(store.list(TRIP)).toHaveLength(1); // upsert same tick
  });

  it('skips when no tick binding exists', () => {
    const store = new WmOutcomeValidationStore();
    const bridge = new WmOutcomeValidationBridgeService(store);
    const record = bridge.onCgusUserAction({
      tripId: 'trip_no_binding',
      decisionId: 'd1',
      userAction: 'ACCEPT',
    });
    expect(record).toBeNull();
    expect(store.list('trip_no_binding')).toHaveLength(0);
  });

  it('TravelOutcome backfill merges into latest accept record', async () => {
    const roadStore = await seedClosedRoadBinding();
    const store = new WmOutcomeValidationStore();
    const bridge = new WmOutcomeValidationBridgeService(store, roadStore);

    bridge.onCgusUserAction({
      tripId: TRIP,
      decisionId: 'run:OPTIMIZE:v1',
      userAction: 'ACCEPT',
    });

    const backfilled = bridge.onTravelOutcomePersisted({
      tripId: TRIP,
      success: 'excellent',
      overallScore: 0.92,
      satisfaction: 9,
    });
    expect(backfilled).not.toBeNull();
    expect(backfilled!.outcome.success).toBe('SUCCESS');
    expect(backfilled!.experience.satisfaction).toBe(9);
  });
});
