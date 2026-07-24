/**
 * Dual-runner claim/lease/heartbeat + signal pause fault injection.
 */

import {
  INTEGRATION_INSTANCES,
  reloadExecution,
  seedAuthorityCheckpoint,
} from './benchmark-test.harness';
import {
  setupBenchmarkIntegration,
  assertIntegrationReady,
  type BenchmarkIntegrationContext,
} from './benchmark-integration.guard';

describe('E1 fault injection — dual runner', () => {
  let ctx: BenchmarkIntegrationContext;

  beforeAll(async () => {
    ctx = await setupBenchmarkIntegration({
      leaseMs: 2_000,
      sleepFn: () => Promise.resolve(),
    });
  });

  afterAll(async () => {
    await ctx.harness?.dispose();
  });

  it('assigns concurrent claims to different instances only', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const instances = INTEGRATION_INSTANCES.slice(0, 2);
      const { benchmarkRunId } = await h.createRun(instances);

      const [a, b] = await Promise.all([
        h.store.claimNextInstance({ benchmarkRunId, runnerId: 'runner-A' }),
        h.store.claimNextInstance({ benchmarkRunId, runnerId: 'runner-B' }),
      ]);

      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a!.id).not.toBe(b!.id);
    });

  it('denies claim while active lease has not expired', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES[1];
      const { benchmarkRunId } = await h.createRun([inst]);

      const a = await h.store.claimNextInstance({ benchmarkRunId, runnerId: 'runner-A' });
      expect(a).toBeDefined();

      const b = await h.store.claimNextInstance({ benchmarkRunId, runnerId: 'runner-B' });
      expect(b).toBeUndefined();
    });

  it('allows takeover after lease expiry without duplicate authority', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      const a = await h.store.claimNextInstance({ benchmarkRunId, runnerId: 'runner-A' });
      await seedAuthorityCheckpoint(h.store, a!, {
        fakeServer: h.fakeServer,
        tripId: inst.tripId,
      });

      await h.prisma.decisionBenchmarkInstanceExecution.update({
        where: { id: a!.id },
        data: { leaseExpiresAt: new Date(Date.now() - 1_000) },
      });

      const b = await h.store.claimNextInstance({ benchmarkRunId, runnerId: 'runner-B' });
      expect(b?.lockedBy).toBe('runner-B');

      const authorityBefore = h.fakeServer.metrics.authorityRequestCount;
      const result = await h.executorFor('runner-B').execute(b!, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.authorityRequestCount).toBe(authorityBefore);
    });

  it('extends lease via heartbeat during shadow wait', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      h.fakeServer.registerInstance(inst.instanceId, { deferShadowPolls: 5 });

      const { benchmarkRunId } = await h.createRun([inst]);
      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-hb',
      });

      await seedAuthorityCheckpoint(h.store, claimed!, {
        fakeServer: h.fakeServer,
        tripId: inst.tripId,
      });

      await h.store.heartbeat(claimed!.id, 'runner-hb');
      const mid = await reloadExecution(h.store, claimed!.id);
      expect(mid.leaseExpiresAt).toBeTruthy();
      expect(new Date(mid.leaseExpiresAt!).getTime()).toBeGreaterThan(Date.now() - 1_000);

      const blocked = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-other',
      });
      expect(blocked).toBeUndefined();
    });

  it('pause releases lease and allows resume without duplicate work', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-pause',
      });

      await seedAuthorityCheckpoint(h.store, claimed!, {
        fakeServer: h.fakeServer,
        tripId: inst.tripId,
      });

      await h.store.updateRunStatus(benchmarkRunId, 'PAUSED');
      await h.store.releaseLease(claimed!.id, 'runner-pause');

      const paused = await h.store.getRun(benchmarkRunId);
      expect(paused?.status).toBe('PAUSED');

      const afterRelease = await reloadExecution(h.store, exec.id);
      expect(afterRelease.lockedBy).toBeFalsy();

      await h.store.updateRunStatus(benchmarkRunId, 'RUNNING');
      const resumedClaim = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-resume',
      });
      expect(resumedClaim?.status).toBe('AUTHORITY_COMPLETED');

      const authorityBefore = h.fakeServer.metrics.authorityRequestCount;
      const result = await h.executorFor('runner-resume').execute(resumedClaim!, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.authorityRequestCount).toBe(authorityBefore);
    });

  afterEach(async () => {
    if (!ctx.harness) return;
    const h = ctx.harness;
    const dangling = await h.prisma.decisionBenchmarkInstanceExecution.findMany({
      where: {
        benchmarkRunId: { startsWith: 'bench_test_' },
        lockedBy: { not: null },
      },
    });
    for (const row of dangling) {
      await h.store.releaseLease(row.id, row.lockedBy!);
    }
  });
});
