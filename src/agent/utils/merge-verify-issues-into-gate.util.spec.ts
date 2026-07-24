import type { GateResult } from '../interfaces/trip-plan.interface';
import type { VerificationIssue } from '../../decision/kernel/decision-state.types';
import {
  mergeVerificationIssuesIntoGateResult,
  VERIFY_SYNTHETIC_VIOLATION_PREFIX,
} from './merge-verify-issues-into-gate.util';

describe('mergeVerificationIssuesIntoGateResult', () => {
  const baseGate = (): GateResult => ({
    gate_result: 'ALLOW',
    violations: [],
    required_adjustments: [],
    confidence: 0.8,
    guardian_results: {
      source: 'violation_projection_v1',
      is_simulated: true,
      abu: { verdict: 'ALLOW', evidence: ['x'], evidence_atoms: [] },
      drdre: { verdict: 'ALLOW', evidence: ['y'], evidence_atoms: [] },
      neptune: { verdict: 'ALLOW', evidence: ['z'], evidence_atoms: [] },
    },
  });

  it('merges CONFLICT ROUTE_INFEASIBLE as HARD SAFETY and forces Abu REJECT', () => {
    const gate = baseGate();
    const issues: VerificationIssue[] = [
      {
        code: 'ROUTE_INFEASIBLE',
        class: 'CONFLICT',
        message: '2WD 与 F-road 不匹配',
        source: 'ROUTE_FEASIBILITY',
      },
    ];
    const out = mergeVerificationIssuesIntoGateResult(gate, issues)!;
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0].severity).toBe('HARD');
    expect(out.violations[0].verify_synthetic).toBe(true);
    expect(out.violations[0].type).toBe('SAFETY');
    expect(out.violations[0].detail).toContain(VERIFY_SYNTHETIC_VIOLATION_PREFIX);
    expect(out.violations[0].detail).toContain('ROUTE_INFEASIBLE');
    expect(out.guardian_results?.abu?.verdict).toBe('REJECT');
    expect(out.guardian_results?.abu?.evidence_atoms?.some((a) => String(a.text).includes('ROUTE_INFEASIBLE'))).toBe(
      true,
    );
  });

  it('strips prior VERIFY rows when merging empty issues', () => {
    const gate: GateResult = {
      ...baseGate(),
      violations: [
        {
          type: 'SAFETY',
          severity: 'SOFT',
          detail: `${VERIFY_SYNTHETIC_VIOLATION_PREFIX} ROUTE_INFEASIBLE: old`,
        },
      ],
    };
    const out = mergeVerificationIssuesIntoGateResult(gate, [])!;
    expect(out.violations).toHaveLength(0);
  });

  it('does not overwrite non-simulated llm_debate guardian_results', () => {
    const gate: GateResult = {
      ...baseGate(),
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'REJECT', evidence: ['debated'], evidence_atoms: [{ text: 'debated', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [] },
        neptune: { verdict: 'ALLOW', evidence: ['n'], evidence_atoms: [] },
      },
    };
    const issues: VerificationIssue[] = [
      { code: 'ROUTE_INFEASIBLE', class: 'CONFLICT', message: 'x', source: 'ROUTE_FEASIBILITY' },
    ];
    const out = mergeVerificationIssuesIntoGateResult(gate, issues)!;
    expect(out.violations).toHaveLength(1);
    expect(out.guardian_results?.source).toBe('llm_debate');
    expect(out.guardian_results?.abu?.verdict).toBe('REJECT');
  });
});
