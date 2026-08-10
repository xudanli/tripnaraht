import {
  projectTravelWorldStateForTurn,
  echoTravelWorldStateObservability,
  linkApplyReceiptToTravelEventLedger,
  appendOutcomeToTravelEventLedger,
  readOutcomeReconciliationFromOptions,
  readTravelWorldStateSeedFromOptions,
} from './attach-state-learning.util';
import {
  TravelEventLedgerStore,
  resetDefaultTravelEventLedgerForTests,
} from './travel-event-ledger.store';
import { compileAgentTaskContract } from '../harness/compile-agent-task-contract.util';
import { assertMemoryNotUsedAsTruth } from './episodic-memory.guard';
import { projectEpisodesFromLedgerEvents } from './episodic-memory.guard';

describe('attach-state-learning wiring', () => {
  afterEach(() => {
    resetDefaultTravelEventLedgerForTests();
  });

  it('projects WorldState echo from TaskContract + seed', () => {
    const contract = compileAgentTaskContract({
      message: '哪一天没住宿',
      turnId: 'turn_w',
      tripId: 'trip_w',
    });
    const state = projectTravelWorldStateForTurn({
      tripId: 'trip_w',
      contract,
      seed: {
        missingLodgingDays: [2],
        tripMeta: { planVersion: 5, name: '测试行程' },
      },
    });
    expect(state.authority).toBe('PROJECTION_ONLY');
    expect(state.booking.missingLodgingDays).toEqual([2]);
    expect(echoTravelWorldStateObservability(state).plan_version).toBe(5);
  });

  it('links apply receipt on Confirm→Apply', () => {
    const ledger = new TravelEventLedgerStore();
    const { eventIds } = linkApplyReceiptToTravelEventLedger({
      tripId: 'trip_a',
      turnId: 'turn_a',
      taskId: 'task_a',
      actionId: 'act_applied',
      planVersion: 6,
      ledger,
    });
    expect(eventIds.length).toBeGreaterThanOrEqual(2);
    const hits = ledger.query({ tripId: 'trip_a', actionId: 'act_applied' });
    expect(hits.some((e) => e.kind === 'ACTION_RECEIPT')).toBe(true);
    expect(hits.some((e) => e.kind === 'AGENT_TURN_TRACE')).toBe(true);
  });

  it('appends Outcome to Ledger as learning signal only', () => {
    const ledger = new TravelEventLedgerStore();
    const { eventId, observability, outcome } = appendOutcomeToTravelEventLedger({
      tripId: 'trip_o',
      ledger,
      outcome: {
        kind: 'ARRIVAL_TIME',
        predictedZh: '18:00',
        observedZh: '18:30',
        deltaZh: '+30min',
        turnId: 'turn_o',
      },
    });
    expect(eventId).toBeTruthy();
    expect(outcome.learningSignalOnly).toBe(true);
    expect(observability.learning_signal_only).toBe(true);
    const entries = ledger.query({ tripId: 'trip_o', kind: 'OUTCOME' });
    expect(entries).toHaveLength(1);
    expect(entries[0].payload.not_evidence).toBe(true);
  });

  it('reads options seed/outcome and keeps Memory≠Truth', () => {
    expect(
      readTravelWorldStateSeedFromOptions({
        travel_world_state_seed: { missingLodgingDays: [1] },
      })?.missingLodgingDays,
    ).toEqual([1]);
    expect(
      readOutcomeReconciliationFromOptions({
        outcome_reconciliation: {
          kind: 'FATIGUE',
          predictedZh: 'LOW',
          observedZh: 'HIGH',
        },
      })?.kind,
    ).toBe('FATIGUE');
    expect(readOutcomeReconciliationFromOptions({ outcome_reconciliation: { kind: 'X' } })).toBe(
      null,
    );

    const ledger = new TravelEventLedgerStore();
    ledger.append({
      kind: 'LIVE_RISK',
      correlation: { tripId: 't1' },
      payload: { riskEventId: 'r1' },
    });
    const ep = projectEpisodesFromLedgerEvents(ledger.snapshot())[0];
    expect(assertMemoryNotUsedAsTruth({ role: 'EVIDENCE', memory: ep }).ok).toBe(false);
  });
});
