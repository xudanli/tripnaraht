import { runBridgeKernelReplaySuite } from './bridge-kernel-replay.util';

describe('bridge-kernel-replay integration', () => {
  jest.setTimeout(60000);

  it('physical conflict aligned cases achieve session_consistency_score >= 95', async () => {
    const report = await runBridgeKernelReplaySuite();
    const physical = report.results.filter((r) => r.path === 'physical_mc_alignment');
    expect(physical.length).toBe(2);
    for (const row of physical) {
      expect(row.session_consistency_score).toBeGreaterThanOrEqual(95);
      expect(row.aligned).toBe(true);
      expect(row.audit_contract_violations).toBe(0);
    }
  });

  it('compare path with injected DecisionKernel ranks gate winner and emits audit', async () => {
    const report = await runBridgeKernelReplaySuite();
    const compare = report.results.find((r) => r.id === 'pwb_compare_kernel_injection');
    expect(compare).toBeDefined();
    expect(compare?.passed).toBe(true);
    expect(compare?.dominant_cid).toBe('KERNEL_LLM_COMPARE_MISMATCH');
    expect(compare?.details?.recommendedByGate).toBe('opt_compact');
  });

  it('suite gate passes end-to-end', async () => {
    const report = await runBridgeKernelReplaySuite();
    expect(report.gate.passed).toBe(true);
    expect(report.passedCount).toBe(report.caseCount);
  });
});
