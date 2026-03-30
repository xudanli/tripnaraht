import { analyzeDecisionLogTraceability } from './decision-log-traceability.contract';
import type { DecisionLogEntry } from '../shared/decision-result.types';

describe('decision-log-traceability.contract (TD-04)', () => {
  const minimalValid = (over?: Partial<DecisionLogEntry>): DecisionLogEntry => ({
    persona: 'ABU',
    action: 'ALLOW',
    explanation: 'ok',
    reasonCodes: [],
    timestamp: new Date().toISOString(),
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
    evidenceRefs: ['ev-1'],
    ...over,
  });

  it('passes for well-formed decision log', () => {
    const r = analyzeDecisionLogTraceability([minimalValid()]);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects non-array', () => {
    const r = analyzeDecisionLogTraceability({});
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('array');
  });

  it('rejects missing timestamp', () => {
    const r = analyzeDecisionLogTraceability([minimalValid({ timestamp: '' })]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('timestamp'))).toBe(true);
  });

  it('rejects empty explanation', () => {
    const r = analyzeDecisionLogTraceability([minimalValid({ explanation: '  ' })]);
    expect(r.valid).toBe(false);
  });

  it('warns PHYSICAL without evidenceRefs', () => {
    const r = analyzeDecisionLogTraceability([
      minimalValid({ evidenceRefs: undefined, decisionSource: 'PHYSICAL' }),
    ]);
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(1);
  });
});
