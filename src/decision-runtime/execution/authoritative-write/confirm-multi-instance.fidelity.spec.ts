/**
 * Confirm multi-instance fidelity — dual logical instances + Trip FOR UPDATE mutex.
 * Always runnable (no Postgres). Complements opt-in PG live e2e.
 */
import {
  runFidelityConcurrent,
  runFidelitySequential,
} from './confirm-multi-instance.fidelity.harness';

describe('Confirm multi-instance fidelity (dual logical instances)', () => {
  it('FID-SEQ: instance A Apply → instance B IDEMPOTENT_REPLAY; one Item write', async () => {
    const result = await runFidelitySequential();
    expect(result.passed).toBe(true);
  });

  it('FID-CONC: concurrent dual clients ≤1 APPLIED under FOR UPDATE mutex', async () => {
    const result = await runFidelityConcurrent();
    expect(result.passed).toBe(true);
    expect(result.applied).toBe(1);
  });
});
