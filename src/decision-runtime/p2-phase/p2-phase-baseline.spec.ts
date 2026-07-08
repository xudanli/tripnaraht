import { snapshotCanaryAdmissionGateCatalog } from './canary-admission-gate.catalog';
import { evaluateCanaryAdmissionGates } from './canary-admission-gate.evaluator';
import { snapshotConstraintOnRolloutCatalog } from './constraint-on-rollout.catalog';

describe('CanaryAdmissionGate catalog', () => {
  it('exports O7 gate SSOT with required canary gates', () => {
    const snap = snapshotCanaryAdmissionGateCatalog();
    expect(snap.version).toBe('canary-gates@v1');
    expect(snap.gateCount).toBeGreaterThanOrEqual(10);
    expect(snap.requiredForCanaryCount).toBeGreaterThanOrEqual(8);
    expect(snap.gates.some((g) => g.gateId === 'HOLDOUT_RUN_COMPLETE')).toBe(true);
  });
});

describe('evaluateCanaryAdmissionGates', () => {
  it('evaluates calibration-v1 evidence from artifacts', () => {
    const summary = evaluateCanaryAdmissionGates(process.cwd());
    expect(summary.schemaId).toBe('tripnara.canary_admission_evaluation@v1');
    expect(summary.requiredTotal).toBeGreaterThan(0);
    const p0 = summary.gates.find((g) => g.gateId === 'P0_FORMAL_FREEZE');
    expect(p0?.status).toBe('PASS');
    const blind = summary.gates.find((g) => g.gateId === 'CALIBRATION_BLIND_REVIEW');
    expect(blind?.status).toBe('PASS');
  });
});

describe('ConstraintOnRollout catalog', () => {
  it('lists P2 scenarios still in SHADOW_COMPARE', () => {
    const snap = snapshotConstraintOnRolloutCatalog();
    expect(snap.version).toBe('constraint-on-rollout@v1');
    expect(snap.entryCount).toBeGreaterThanOrEqual(6);
    expect(snap.onForSelectedCount).toBe(0);
    expect(snap.shadowCompareCount).toBe(snap.entryCount);
  });
});
