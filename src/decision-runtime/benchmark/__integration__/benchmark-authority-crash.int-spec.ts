/**
 * Authority stage crash + DB-ahead evidence gap fault injection.
 */

import {
  reloadExecution,
  stableIdFor,
  writeAuthorityArtifactOnly,
  seedAuthorityCheckpoint,
  INTEGRATION_INSTANCES,
} from './benchmark-test.harness';
import { writeArtifact } from '../benchmark-artifact.util';
import {
  setupBenchmarkIntegration,
  assertIntegrationReady,
  type BenchmarkIntegrationContext,
} from './benchmark-integration.guard';

describe('E1 fault injection — authority crash', () => {
  let ctx: BenchmarkIntegrationContext;

  beforeAll(async () => {
    ctx = await setupBenchmarkIntegration({ sleepFn: () => Promise.resolve() });
  });

  afterAll(async () => {
    await ctx.harness?.dispose();
  });

  beforeEach(() => {
    if (!ctx.harness) return;
    ctx.harness.fakeServer.metrics.authorityRequestCount = 0;
    ctx.harness.fakeServer.metrics.materializeRequestCount = 0;
  });

  it('recovers when authority artifact exists but DB not advanced (no re-submit)', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
    const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
    const { benchmarkRunId, instances } = await h.createRun([inst]);
    const exec = instances[0];
    const requestId = stableIdFor(benchmarkRunId, inst.instanceId);

    const claimed = await h.store.claimNextInstance({
      benchmarkRunId,
      runnerId: 'runner-crash-a',
    });
    expect(claimed?.id).toBe(exec.id);

    const { hash } = await writeAuthorityArtifactOnly({
      benchmarkRunId,
      instanceId: inst.instanceId,
      requestId,
    });
    h.fakeServer.registerShadowForDecisionRun({
      instanceId: inst.instanceId,
      decisionRunId: requestId,
      tripId: inst.tripId,
    });

    const beforeAuthority = h.fakeServer.metrics.authorityRequestCount;
    const result = await h.executorFor('runner-crash-a').execute(claimed!, inst);
    expect(result.status).toBe('COMPLETED');
    expect(h.fakeServer.metrics.authorityRequestCount).toBe(beforeAuthority);

    const after = await reloadExecution(h.store, exec.id);
    expect(after.requestId).toBe(requestId);
    expect(after.authorityResponseHash).toBe(hash);
    expect(after.comparisonId).toBeTruthy();
    expect(after.reviewCaseId).toBeTruthy();
  });

  it('simulates crash after HTTP authority: artifact written, resume without duplicate HTTP', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
    const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
    const { benchmarkRunId, instances } = await h.createRun([inst]);
    const exec = instances[0];
    let wroteAuthority = false;

    const claimed = await h.store.claimNextInstance({
      benchmarkRunId,
      runnerId: 'runner-crash-b',
    });

    const crashing = h.executorFor('runner-crash-b', h.baseConfig, {
      writeArtifactFn: async (dir, filename, payload) => {
        const result = await writeArtifact(dir, filename, payload);
        if (filename === 'authority-response.json') {
          wroteAuthority = true;
          throw new Error('CRASH_BEFORE_DB_ADVANCE');
        }
        return result;
      },
    });

    await expect(crashing.execute(claimed!, inst)).resolves.toMatchObject({
      status: 'RETRYABLE_FAILED',
    });
    expect(wroteAuthority).toBe(true);
    expect(h.fakeServer.metrics.authorityRequestCount).toBe(1);

    await h.store.releaseLease(claimed!.id, 'runner-crash-b');

    const mid = await reloadExecution(h.store, exec.id);
    expect(mid.status).toBe('RETRYABLE_FAILED');

    const reclaimed = await h.store.claimNextInstance({
      benchmarkRunId,
      runnerId: 'runner-crash-b-resume',
    });
    expect(reclaimed).toBeDefined();
    h.fakeServer.registerShadowForDecisionRun({
      instanceId: inst.instanceId,
      decisionRunId: exec.requestId,
      tripId: inst.tripId,
    });

    const resumed = await h.executorFor('runner-crash-b-resume').execute(reclaimed!, inst);
    expect(resumed.status).toBe('COMPLETED');
    expect(h.fakeServer.metrics.authorityRequestCount).toBe(1);
  });

  it('fails explicitly when DB claims authority but artifact missing', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
    const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
    const { benchmarkRunId, instances } = await h.createRun([inst]);
    const exec = instances[0];

    const claimed = await h.store.claimNextInstance({
      benchmarkRunId,
      runnerId: 'runner-gap',
    });

    await h.store.advanceInstance(claimed!.id, {
      status: 'AUTHORITY_COMPLETED',
      decisionRunId: exec.requestId,
      authorityResponseHash: 'deadbeef',
      authorityCompletedAt: new Date(),
    });

    const row = await reloadExecution(h.store, claimed!.id);
    const result = await h.executorFor('runner-gap').execute(row, inst);
    expect(result.status).toBe('TERMINAL_FAILED');

    const after = await reloadExecution(h.store, exec.id);
    expect(after.lastErrorCode).toBe('EVIDENCE_INCOMPLETE_AUTHORITY');
  });

  it('does not re-submit authority when DB is AUTHORITY_COMPLETED and shadow deferred', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
    const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
    h.fakeServer.registerInstance(inst.instanceId, {
      deferShadowPolls: 2,
      divergenceTypes: ['DIFFERENT_WINNER'],
      eligibleForStrategyComparison: true,
    });

    const { benchmarkRunId, instances } = await h.createRun([inst]);
    const exec = instances[0];

    const claimed = await h.store.claimNextInstance({
      benchmarkRunId,
      runnerId: 'runner-shadow-wait',
    });
    await seedAuthorityCheckpoint(h.store, claimed!, {
      fakeServer: h.fakeServer,
      tripId: inst.tripId,
    });

    const before = h.fakeServer.metrics.authorityRequestCount;
    const result = await h.executorFor('runner-shadow-wait').execute(claimed!, inst);
    expect(result.status).toBe('COMPLETED');
    expect(h.fakeServer.metrics.authorityRequestCount).toBe(before);
  });
});
