/**
 * P0：全国家 decision-closure golden 合集门禁（IS + NZ + 可选 storm capture）。
 */
import { runDecisionClosureGate } from '../../../../scripts/lib/decision-closure-gate';
import { COUNTRY_DECISION_CLOSURE_FIXTURES } from './e2e-cases/registry';

describe('Country decision closure v1 (P0 all packs)', () => {
  it('decision-closure gate passes all registered country fixtures', () => {
    const gate = runDecisionClosureGate(COUNTRY_DECISION_CLOSURE_FIXTURES);
    expect(COUNTRY_DECISION_CLOSURE_FIXTURES.length).toBeGreaterThanOrEqual(4);
    expect(gate.failed).toBe(0);
    expect(gate.passed).toBe(COUNTRY_DECISION_CLOSURE_FIXTURES.length);
  });
});
