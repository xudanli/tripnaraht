/**
 * World Model Outcome Validation — runnable Trip-shaped harness.
 *
 * Records: World / Decision A|B / User / Execution / Outcome / Experience / Safety
 * Answers: Without bridge=A, With bridge=B, was B better?
 *
 * Run:
 *   npx jest src/harness/evals/world-model-outcome-validation/wm-outcome-validation.harness.spec.ts
 */

import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import type { LookRoadAuthorityPort } from '../../../trips/decision/world-consistency/run-look-road-authority-decision-tick';
import {
  measureRoadClosedDecisionImpact,
  formatDecisionImpactReport,
} from '../decision-world-consistency/measure-decision-impact.util';
import {
  buildWmOutcomeValidationRecord,
} from '../../../trips/decision/outcome-validation/build-wm-outcome-validation-record.util';
import { WmOutcomeValidationStore } from '../../../trips/decision/outcome-validation/wm-outcome-validation.store';
import { readFileSync, existsSync } from 'fs';

const TRIP = 'trip_is_outcome_validation_demo';
const ROAD = 'F208';

async function runClosedRoadImpact() {
  const store = new DecisionTickRoadBindingStore();
  const port: LookRoadAuthorityPort = {
    resolveAuthority: async () => ({
      kind: 'RESOLVED',
      status: 'CLOSED',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_ov_f208',
      version: 'ov@v1',
    }),
  };
  const svc = new LookRoadAuthorityDecisionTickService(store, port as never);
  await svc.maybeTriggerFromLookObservation({
    tripId: TRIP,
    observationId: 'obs_ov',
    facts: [
      {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
        value: ROAD,
        confidence: 0.9,
        source: 'OCR',
      },
    ],
    tickId: 'tick_ov_road',
  });
  const binding = store.getLatestBinding(TRIP)!;
  const impact = measureRoadClosedDecisionImpact({ binding });
  return { binding, impact };
}

describe('World Model Outcome Validation (runnable)', () => {
  it('records A vs B and judges B better when bridge avoids risk', async () => {
    const { binding, impact } = await runClosedRoadImpact();
    expect(impact.decisionWouldDifferIfBridgeDeleted).toBe(true);

    const ledger = new WmOutcomeValidationStore();
    const record = buildWmOutcomeValidationRecord({
      tripId: TRIP,
      tickId: impact.tickId,
      impact,
      world: {
        freshness: 'FRESH',
        authority: 'OFFICIAL',
        sourceVersion: binding.materialization.sourceVersion,
      },
      served: 'WITH_BRIDGE',
      user: { action: 'ACCEPT' },
      execution: {
        status: 'EXECUTED',
        repairOccurred: false,
      },
      outcome: {
        success: 'SUCCESS',
        notes: 'Rerouted off F208; day completed',
      },
      experience: { regret: false, satisfaction: 0.85 },
      safety: {
        result: 'AVOIDED_RISK',
        notes: 'Did not drive CLOSED F-road',
      },
    });

    ledger.put(record);
    const path = ledger.appendJsonl(record);

    // eslint-disable-next-line no-console
    console.log(
      [
        '=== WM OUTCOME VALIDATION ===',
        ...formatDecisionImpactReport(impact),
        `A=${record.decisionWithoutBridge.summary}`,
        `B=${record.decisionWithBridge.summary}`,
        `served=${record.served}`,
        `bWasBetter=${record.verdict.bWasBetter}`,
        `rationale=${record.verdict.rationale.join(' | ')}`,
        `jsonl=${path}`,
      ].join('\n'),
    );

    expect(record.decisionWithoutBridge.summary).toContain('ALLOW');
    expect(record.decisionWithBridge.summary).toContain('BLOCK');
    expect(record.verdict.decisionDiffered).toBe(true);
    expect(record.verdict.bWasBetter).toBe(true);
    expect(existsSync(path)).toBe(true);
    const line = readFileSync(path, 'utf8').trim().split('\n').pop()!;
    expect(JSON.parse(line).recordId).toBe(record.recordId);
  });

  it('returns null when outcome evidence missing', async () => {
    const { impact, binding } = await runClosedRoadImpact();
    const record = buildWmOutcomeValidationRecord({
      tripId: TRIP,
      tickId: 'tick_ov_insufficient',
      impact,
      world: {
        freshness: 'FRESH',
        authority: 'OFFICIAL',
        sourceVersion: binding.materialization.sourceVersion,
      },
      served: 'WITH_BRIDGE',
      user: { action: 'UNKNOWN' },
      execution: { status: 'UNKNOWN', repairOccurred: false },
      outcome: { success: 'UNKNOWN' },
      safety: { result: 'UNKNOWN' },
    });
    expect(record.verdict.bWasBetter).toBeNull();
  });

  it('marks B better when served A and risk materialized', async () => {
    const { impact, binding } = await runClosedRoadImpact();
    const record = buildWmOutcomeValidationRecord({
      tripId: TRIP,
      tickId: 'tick_ov_served_a',
      impact,
      world: {
        freshness: 'FRESH',
        authority: 'OFFICIAL',
        sourceVersion: binding.materialization.sourceVersion,
      },
      served: 'WITHOUT_BRIDGE',
      user: { action: 'ACCEPT' },
      execution: { status: 'EXECUTED', repairOccurred: true, repairCodes: ['REPAIR_ROAD'] },
      outcome: { success: 'FAILURE', notes: 'Drove into closed highland' },
      experience: { regret: true, satisfaction: 0.2 },
      safety: { result: 'RISK_MATERIALIZED' },
    });
    expect(record.verdict.bWasBetter).toBe(true);
  });
});
