/**
 * Confirm multi-instance live proof (opt-in PostgreSQL).
 *
 * Skipped unless CONFIRM_MULTI_INSTANCE_LIVE=1 and DATABASE_URL are set.
 */

import {
  createConfirmLivePrisma,
  isConfirmMultiInstanceLiveEnabled,
  runCrossClientConcurrentLive,
  runCrossClientSequentialLive,
} from './confirm-multi-instance-live.harness';

const describeLive = isConfirmMultiInstanceLiveEnabled() ? describe : describe.skip;

describeLive('Confirm multi-instance live (PostgreSQL)', () => {
  let prismaA: ReturnType<typeof createConfirmLivePrisma>;
  let prismaB: ReturnType<typeof createConfirmLivePrisma>;

  beforeAll(async () => {
    prismaA = createConfirmLivePrisma();
    prismaB = createConfirmLivePrisma();
    await prismaA.$connect();
    await prismaB.$connect();
  });

  afterAll(async () => {
    await prismaA?.$disconnect();
    await prismaB?.$disconnect();
  });

  it('LIVE-CROSS-CLIENT-SEQUENTIAL: A Apply → B replay via durable Trip.metadata', async () => {
    const result = await runCrossClientSequentialLive(prismaA, prismaB);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.appliedCount).toBe(1);
    expect(result.replayCount).toBe(1);
    expect(result.durableIdemHit).toBe(true);
  }, 60_000);

  it('LIVE-CROSS-CLIENT-CONCURRENT: dual clients ≤1 APPLIED with Trip FOR UPDATE', async () => {
    const result = await runCrossClientConcurrentLive(prismaA, prismaB);
    if (!result.passed) {
      throw new Error(`${result.scenarioId}: ${result.message}`);
    }
    expect(result.appliedCount).toBe(1);
    expect(result.durableIdemHit).toBe(true);
  }, 60_000);
});

if (!isConfirmMultiInstanceLiveEnabled()) {
  it('Confirm multi-instance live skipped (set CONFIRM_MULTI_INSTANCE_LIVE=1 + non-prod CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL, or run embedded script)', () => {
    expect(isConfirmMultiInstanceLiveEnabled()).toBe(false);
  });
}
