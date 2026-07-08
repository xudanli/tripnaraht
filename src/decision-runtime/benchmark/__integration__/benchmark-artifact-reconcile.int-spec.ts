/**
 * Artifact/DB reconcile + write failure + hash mismatch fault injection.
 */

import {
  reloadExecution,
  writeAuthorityArtifactOnly,
  INTEGRATION_INSTANCES,
  forceTerminalStatus,
} from './benchmark-test.harness';
import { instanceArtifactDir, writeArtifact } from '../benchmark-artifact.util';
import { buildFakeShadowEvent } from './benchmark-fake-http.server';
import { BenchmarkTransitionError } from '../benchmark-transition.util';
import {
  setupBenchmarkIntegration,
  assertIntegrationReady,
  type BenchmarkIntegrationContext,
} from './benchmark-integration.guard';

describe('E1 fault injection — artifact reconcile', () => {
  let ctx: BenchmarkIntegrationContext;

  beforeAll(async () => {
    ctx = await setupBenchmarkIntegration({ sleepFn: () => Promise.resolve() });
  });

  afterAll(async () => {
    await ctx.harness?.dispose();
  });

  it('reconciles shadow artifact ahead of DB without re-running authority', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];
      const artifactDir = instanceArtifactDir(benchmarkRunId, inst.instanceId);

      await writeAuthorityArtifactOnly({
        benchmarkRunId,
        instanceId: inst.instanceId,
        requestId: exec.requestId,
      });

      const shadow = buildFakeShadowEvent({
        comparisonId: 'cmp_reconcile',
        decisionRunId: exec.requestId,
        tripId: inst.tripId,
        eligible: true,
        divergenceTypes: ['DIFFERENT_WINNER'],
        authorityWinner: 'cand-a',
        shadowWinner: 'cand-b',
      });
      await writeArtifact(artifactDir, 'shadow-event.json', shadow);

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-reconcile',
      });

      const authorityBefore = h.fakeServer.metrics.authorityRequestCount;
      const result = await h.executorFor('runner-reconcile').execute(claimed!, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.authorityRequestCount).toBe(authorityBefore);

      const after = await reloadExecution(h.store, exec.id);
      expect(after.comparisonId).toBe('cmp_reconcile');
    });

  it('does not advance DB when shadow artifact write fails', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-write-fail',
      });

      let failShadowWrite = true;
      const executor = h.executorFor('runner-write-fail', h.baseConfig, {
        writeArtifactFn: async (dir, filename, payload) => {
          if (filename === 'shadow-event.json' && failShadowWrite) {
            throw new Error('DISK_FULL');
          }
          return writeArtifact(dir, filename, payload);
        },
      });

      const first = await executor.execute(claimed!, inst);
      expect(first.status).toBe('RETRYABLE_FAILED');

      await h.store.releaseLease(claimed!.id, 'runner-write-fail');

      const mid = await reloadExecution(h.store, exec.id);
      expect(mid.status).not.toBe('SHADOW_COMPLETED');

      const reclaimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-write-fail-resume',
      });
      expect(reclaimed).toBeDefined();

      failShadowWrite = false;
      const result = await executor.execute(reclaimed!, inst);
      expect(result.status).toBe('COMPLETED');
    });

  it('detects artifact hash mismatch as terminal evidence error', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];
      const artifactDir = instanceArtifactDir(benchmarkRunId, inst.instanceId);

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-hash',
      });

      const { hash } = await writeAuthorityArtifactOnly({
        benchmarkRunId,
        instanceId: inst.instanceId,
        requestId: exec.requestId,
      });

      const tamperedHash =
        hash.slice(0, 63) + (hash[63] === 'a' ? 'b' : 'a');

      await h.store.advanceInstance(claimed!.id, {
        status: 'AUTHORITY_COMPLETED',
        decisionRunId: exec.requestId,
        authorityResponseHash: tamperedHash,
        artifactDirectory: artifactDir,
        authorityCompletedAt: new Date(),
      });

      const row = await reloadExecution(h.store, claimed!.id);
      const result = await h.executorFor('runner-hash').execute(row, inst);
      expect(result.status).toBe('TERMINAL_FAILED');

      const after = await reloadExecution(h.store, exec.id);
      expect(after.lastErrorCode).toBe('ARTIFACT_HASH_MISMATCH');
    });

  it('blocks illegal backward status transitions', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES[0];
      const { instances } = await h.createRun([inst]);
      const exec = instances[0];

      await forceTerminalStatus(h.prisma, exec.id, 'COMPLETED');

      await expect(
        h.store.advanceInstance(exec.id, { status: 'RUNNING' }),
      ).rejects.toBeInstanceOf(BenchmarkTransitionError);
    });

  it('TERMINAL_FAILED instance is not auto-claimed', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES[0];
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      await forceTerminalStatus(h.prisma, exec.id, 'TERMINAL_FAILED');

      const claim = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-terminal',
      });
      expect(claim).toBeUndefined();
  });
});
