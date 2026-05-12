import type { CausalFieldSnapshot } from '../contracts/multi-agent-causal-field.types';
import { OCT_UNIVERSE_SCHEMA } from '../contracts/oct.types';
import type { OntologicalTriple } from '../contracts/oct.types';
import {
  beliefNearFixedPoint,
  classifyPhiTrajectory,
  ecpsConvergenceBasinStub,
  structuralResidualOct,
  witnessOntologicalFixedPoint,
} from './fpti-stability.util';

function phi(vals: number[]): CausalFieldSnapshot {
  return {
    queryId: 'q',
    timeStep: 0,
    particles: vals.map((v, i) => ({ agentId: `a${i}`, phi: v })),
  };
}

function omega(phiVal: number): OntologicalTriple {
  return {
    schema: OCT_UNIVERSE_SCHEMA,
    S: { phi: phi([phiVal, phiVal]) },
    O: {
      kernelFingerprint: 'k:test',
      execMode: 'EXEC',
      shadowMode: 'SHADOW',
    },
    C: { holds: true, obligationsSatisfied: [], violations: [] },
  };
}

describe('fpti-stability.util', () => {
  it('classifyPhiTrajectory detects divergence on NaN', () => {
    const bad: CausalFieldSnapshot = {
      queryId: 'q',
      timeStep: 0,
      particles: [{ agentId: 'a', phi: NaN }],
    };
    expect(classifyPhiTrajectory([phi([0.5, 0.5]), bad]).failureMode).toBe('DIVERGENCE');
  });

  it('classifyPhiTrajectory detects period-2 oscillation tail', () => {
    const p = [
      phi([0.5, 0.5]),
      phi([0.6, 0.4]),
      phi([0.5, 0.5]),
      phi([0.6, 0.4]),
    ];
    expect(classifyPhiTrajectory(p).failureMode).toBe('OSCILLATION');
  });

  it('classifyPhiTrajectory detects collapse', () => {
    const p = [phi([0.5, 0.5]), phi([0.50000000001, 0.49999999999])];
    const w = classifyPhiTrajectory(p, { collapseVarianceBelow: 1e-20 });
    expect(w.failureMode).toBe('COLLAPSE');
  });

  it('structuralResidualOct respects S and C', () => {
    const a = omega(0.5);
    const b: OntologicalTriple = {
      ...omega(0.5),
      C: { holds: false, obligationsSatisfied: [], violations: ['x'] },
    };
    expect(structuralResidualOct(a, b)).toBeGreaterThan(0);
  });

  it('witnessOntologicalFixedPoint finds near triple', () => {
    const seq = [omega(0.5), omega(0.51), omega(0.5001)];
    const w = witnessOntologicalFixedPoint(seq, 0.2);
    expect(w.admitsApproximateFixedPoint).toBe(true);
  });

  it('beliefNearFixedPoint', () => {
    expect(
      beliefNearFixedPoint({ masses: { a: 1 } }, { masses: { a: 1 } }, 0.01),
    ).toBe(true);
  });

  it('ecpsConvergenceBasinStub', () => {
    expect(
      ecpsConvergenceBasinStub(0.01, {
        schema: 'fpti/trajectory-witness/v1',
        failureMode: 'NONE',
        notes: [],
      }),
    ).toBe('IN_ATTRACTOR');
  });
});
