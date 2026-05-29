import type { GateResult } from '../interfaces/trip-plan.interface';
import { attachGuardianPersonaSurface, deriveGuardianPersonaVotes } from './guardian-persona-surface.util';

describe('guardian-persona-surface.util', () => {
  it('deriveGuardianPersonaVotes maps BLOCK + REPLACE_SEGMENT with atoms and audit meta', () => {
    const gate: GateResult = {
      gate_result: 'BLOCK',
      violations: [
        { type: 'REACHABILITY', severity: 'HARD', detail: 'F208 is closed' },
      ],
      required_adjustments: [{ action: 'REPLACE_SEGMENT', why: 'Use detour' }],
      confidence: 0.9,
      evidence_refs: [],
    };
    const g = deriveGuardianPersonaVotes(gate);
    expect(g.source).toBe('violation_projection_v1');
    expect(g.is_simulated).toBe(true);
    expect(g.abu?.verdict).toBe('REJECT');
    expect(g.abu?.evidence_atoms?.[0]?.violation_code).toBe('GATE_VIOLATION:REACHABILITY:HARD');
    expect(g.abu?.evidence_atoms?.[0]?.tag).toBe('reachability');
    expect(g.neptune?.verdict).toBe('REPLACE');
    expect(g.neptune?.evidence_atoms?.[0]?.violation_code).toBe('ADJUSTMENT:REPLACE_SEGMENT');
    expect(g.neptune?.evidence_atoms?.[0]?.tag).toBe('replace_segment');
    expect(g.drdre?.verdict).toBe('ALLOW');
  });

  it('attachGuardianPersonaSurface fills missing guardian_results', () => {
    const gate: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
      evidence_refs: [],
    };
    const out = attachGuardianPersonaSurface(gate);
    expect(out?.guardian_results?.source).toBe('violation_projection_v1');
    expect(out?.guardian_results?.is_simulated).toBe(true);
    expect(out?.guardian_results?.abu?.evidence_atoms?.length).toBeGreaterThan(0);
  });

  it('attachGuardianPersonaSurface preserves complete upstream guardian_results', () => {
    const gate: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
      evidence_refs: [],
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['custom'], evidence_atoms: [{ text: 'custom', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['custom-d'] },
        neptune: { verdict: 'ALLOW', evidence: ['custom-n'] },
      },
    };
    const out = attachGuardianPersonaSurface(gate);
    expect(out?.guardian_results?.abu?.evidence?.[0]).toBe('custom');
    expect(out?.guardian_results?.source).toBe('llm_debate');
  });

  it('attachGuardianPersonaSurface labels upstream when source missing', () => {
    const gate: GateResult = {
      gate_result: 'ALLOW',
      violations: [],
      required_adjustments: [],
      confidence: 0.8,
      evidence_refs: [],
      guardian_results: {
        abu: { verdict: 'ALLOW', evidence: ['x'] },
        drdre: { verdict: 'ALLOW', evidence: ['y'] },
        neptune: { verdict: 'ALLOW', evidence: ['z'] },
      },
    };
    const out = attachGuardianPersonaSurface(gate);
    expect(out?.guardian_results?.source).toBe('upstream_unlabeled');
  });

  it('attachGuardianPersonaSurface returns undefined for null input', () => {
    expect(attachGuardianPersonaSurface(undefined)).toBeUndefined();
  });
});
