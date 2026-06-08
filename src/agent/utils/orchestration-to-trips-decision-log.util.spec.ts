import type { DecisionLogEntry } from '../interfaces/trip-plan.interface';
import { mapOrchestrationDecisionLogToTrips } from './orchestration-to-trips-decision-log.util';

describe('orchestration-to-trips-decision-log.util', () => {
  const row = (over: Partial<DecisionLogEntry>): DecisionLogEntry =>
    ({
      request_id: 'req-1',
      step: 'GATE_EVAL',
      actor: 'Gatekeeper',
      inputs_summary: '',
      outputs_summary: 'BLOCK: F208 closed',
      evidence_refs: ['ev-f208'],
      timestamp: '2026-01-16T12:00:00.000Z',
      metadata: { guardian: 'ABU' },
      ...over,
    }) as DecisionLogEntry;

  it('persist mode keeps EVALUATE + HEURISTIC', () => {
    const mapped = mapOrchestrationDecisionLogToTrips([row({})], { forExplain: false });
    expect(mapped[0].action).toBe('EVALUATE');
    expect(mapped[0].decisionSource).toBe('HEURISTIC');
    expect(mapped[0].persona).toBe('ABU');
  });

  it('explain mode infers REJECT + PHYSICAL when evidence present', () => {
    const mapped = mapOrchestrationDecisionLogToTrips([row({ step: 'REPAIR' })], { forExplain: true });
    expect(mapped[0].action).toBe('REPLACE');
    expect(mapped[0].decisionSource).toBe('PHYSICAL');
    expect(mapped[0].evidenceRefs).toEqual(['ev-f208']);
  });
});
