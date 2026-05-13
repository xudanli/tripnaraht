import type { DecisionLogEntry } from '../../interfaces/trip-plan.interface';
import {
  appendBudgetArbitrationEntriesToDecisionLogInPlace,
  mapBudgetArbitrationEntryToK3DecisionLog,
} from './research-budget-arbitration-k3-decision-log.util';

describe('mapBudgetArbitrationEntryToK3DecisionLog', () => {
  it('maps rollback entry to RESEARCH / Orchestrator with metadata.decision_source', () => {
    const e = mapBudgetArbitrationEntryToK3DecisionLog(
      {
        source: 'BUDGET_ARBITRATOR_ROLLBACK',
        scope: 'hotel',
        at: '2026-05-13T12:00:00.000Z',
        overrun_ratio: 0.1,
        reroll_pressure_score: 42.5,
        slot_id: 'p:0:HotelResearchMember',
        austerity_mode: true,
        tightened_bucket: { target_amount: 2000, hard_limit: 2200 },
      },
      'req-1',
    );
    expect(e.step).toBe('RESEARCH');
    expect(e.actor).toBe('Orchestrator');
    expect(e.request_id).toBe('req-1');
    expect(e.metadata?.decision_source).toBe('BUDGET_ARBITRATOR_ROLLBACK');
  });
});

describe('appendBudgetArbitrationEntriesToDecisionLogInPlace', () => {
  it('appends entries from research_data and uses first log request_id', () => {
    const log: DecisionLogEntry[] = [
      {
        request_id: 'rid-a',
        step: 'GATE_EVAL',
        actor: 'Gatekeeper',
        inputs_summary: 'x',
        outputs_summary: 'y',
        evidence_refs: [],
        timestamp: '2026-05-13T11:00:00.000Z',
      },
    ];
    appendBudgetArbitrationEntriesToDecisionLogInPlace(
      log,
      {
        __research_budget_arbitration_decision_log: [
          {
            source: 'BUDGET_ARBITRATOR_ROLLBACK',
            scope: 'hotel',
            at: '2026-05-13T12:00:00.000Z',
            overrun_ratio: 0.2,
            reroll_pressure_score: 10,
            austerity_mode: true,
          },
        ],
      },
      'fallback',
    );
    expect(log).toHaveLength(2);
    expect(log[1]!.request_id).toBe('rid-a');
    expect(log[1]!.metadata?.decision_source).toBe('BUDGET_ARBITRATOR_ROLLBACK');
  });
});
