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

  it('accepts optional jepaTrace with decision-trace-jepa@v1', () => {
    const r = analyzeDecisionLogTraceability([
      minimalValid({
        jepaTrace: {
          contractVersion: 'decision-trace-jepa@v1',
          z_state: { fatigue: 0.3, risk_score: 0.2 },
          predictionErrorKind: 'WORLD',
        },
      }),
    ]);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('rejects jepaTrace.predictionErrorKind when invalid', () => {
    const r = analyzeDecisionLogTraceability([
      minimalValid({
        jepaTrace: {
          contractVersion: 'decision-trace-jepa@v1',
          z_state: { fatigue: 0.1 },
          predictionErrorKind: 'INVALID' as any,
        },
      }),
    ]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('predictionErrorKind'))).toBe(true);
  });

  it('warns when jepaTrace@v1 has no substantive fields', () => {
    const r = analyzeDecisionLogTraceability([
      minimalValid({
        jepaTrace: {
          contractVersion: 'decision-trace-jepa@v1',
        },
      }),
    ]);
    expect(r.valid).toBe(true);
    expect(r.warnings.some((w) => w.includes('empty trace'))).toBe(true);
  });

  it('rejects critical action (REJECT) with empty reasonCodes (PRD §13.B)', () => {
    const r = analyzeDecisionLogTraceability([minimalValid({ action: 'REJECT', reasonCodes: [] })]);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('reasonCodes') && e.includes('REJECT'))).toBe(true);
  });

  it('accepts critical action when reasonCodes is non-empty', () => {
    const r = analyzeDecisionLogTraceability([
      minimalValid({ action: 'ADJUST', reasonCodes: ['PACE_BUFFER'] }),
    ]);
    expect(r.valid).toBe(true);
  });
});
