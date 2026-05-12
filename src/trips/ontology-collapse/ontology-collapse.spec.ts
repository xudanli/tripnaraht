import {
  detectInvariantFlows,
  detectStableRegularities,
  languageStep,
  observeConsistency,
  perceive,
  tryRepresent,
} from './index';

describe('ontology-collapse (P26)', () => {
  const plateau = [
    { tick: 0, signal: 1.0 },
    { tick: 1, signal: 1.0001 },
    { tick: 2, signal: 1.0002 },
    { tick: 3, signal: 2.4 },
    { tick: 4, signal: 2.41 },
  ];

  it('observeConsistency yields patterns with null description', () => {
    const obs = observeConsistency(plateau);
    expect(obs.length).toBeGreaterThanOrEqual(1);
    expect(obs.every(o => o.description === null)).toBe(true);
    expect(obs[0]?.pattern.fingerprint).toBeDefined();
  });

  it('tryRepresent refuses representation', () => {
    expect(() => tryRepresent({ any: 'thing' })).toThrow(/ONTOLOGY_COLLAPSE/);
  });

  it('languageStep strips label and semantics', () => {
    const next = languageStep([
      { label: 'trip', semantics: 'route', trace: 1 },
      { trace: 2 },
    ]);
    expect(next[0]?.label).toBeUndefined();
    expect(next[0]?.semantics).toBeUndefined();
    expect(next[0]?.trace).toBe(1);
    expect(next[1]?.trace).toBe(2);
  });

  it('detectStableRegularities segments stable runs', () => {
    const regs = detectStableRegularities(plateau);
    expect(regs.length).toBeGreaterThanOrEqual(2);
  });

  it('perceive returns only self-sustaining invariant flows', () => {
    const flows = detectInvariantFlows(plateau);
    const sustaining = flows.filter(f => f.selfSustaining);
    const perceived = perceive(plateau);
    expect(perceived.length).toBe(sustaining.length);
    expect(perceived.every(f => f.selfSustaining)).toBe(true);
  });
});
