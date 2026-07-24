/**
 * Shadow wait/resume + failure classification fault injection.
 */

import {
  reloadExecution,
  INTEGRATION_INSTANCES,
  seedAuthorityCheckpoint,
  writeAuthorityArtifactOnly,
} from './benchmark-test.harness';
import { classifyHttpFailure, resolveInstanceStatusAfterFailure } from '../benchmark-failure.util';
import { buildFakeShadowEvent } from './benchmark-fake-http.server';
import { instanceArtifactDir, writeArtifact } from '../benchmark-artifact.util';
import {
  setupBenchmarkIntegration,
  assertIntegrationReady,
  type BenchmarkIntegrationContext,
} from './benchmark-integration.guard';

describe('E1 fault injection — shadow resume', () => {
  let ctx: BenchmarkIntegrationContext;

  beforeAll(async () => {
    ctx = await setupBenchmarkIntegration({ sleepFn: () => Promise.resolve() });
  });

  afterAll(async () => {
    await ctx.harness?.dispose();
  });

  it('polls shadow without re-submitting authority', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      h.fakeServer.registerInstance(inst.instanceId, { deferShadowPolls: 2 });

      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];
      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-shadow',
      });

      const authorityBefore = h.fakeServer.metrics.authorityRequestCount;
      const result = await h.executorFor('runner-shadow').execute(claimed!, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.authorityRequestCount).toBe(authorityBefore + 1);
      expect(h.fakeServer.metrics.shadowListPollCount).toBeGreaterThan(0);
    });

  it('marks RETRYABLE_FAILED on shadow timeout without authority re-submit', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      h.fakeServer.registerInstance(inst.instanceId, { deferShadowPolls: 999 });

      const config = { ...h.baseConfig, shadowWaitTimeoutMs: 50 };
      const { benchmarkRunId, instances } = await h.createRun([inst], config);
      const exec = instances[0];

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-timeout',
      });
      await seedAuthorityCheckpoint(h.store, claimed!, {
        fakeServer: h.fakeServer,
        tripId: inst.tripId,
        registerShadow: false,
      });

      const authorityBefore = h.fakeServer.metrics.authorityRequestCount;
      const result = await h.executorFor('runner-timeout', config).execute(claimed!, inst);
      expect(result.status).toBe('RETRYABLE_FAILED');

      const after = await reloadExecution(h.store, exec.id);
      expect(after.failureClass).toBe('SHADOW_TIMEOUT');
      expect(h.fakeServer.metrics.authorityRequestCount).toBe(authorityBefore);
    });

  it('classifies HTTP failures per policy', () => {
    assertIntegrationReady(ctx);
      expect(classifyHttpFailure({ httpStatus: 401, message: 'x', stage: 'AUTHORITY' }).abortRun).toBe(
        true,
      );
      expect(
        resolveInstanceStatusAfterFailure(
          classifyHttpFailure({ httpStatus: 422, message: 'bad', stage: 'AUTHORITY' }),
          1,
          3,
        ),
      ).toBe('TERMINAL_FAILED');
      expect(
        resolveInstanceStatusAfterFailure(
          classifyHttpFailure({ httpStatus: 500, message: 'err', stage: 'AUTHORITY' }),
          2,
          3,
        ),
      ).toBe('RETRYABLE_FAILED');
      expect(
        resolveInstanceStatusAfterFailure(
          classifyHttpFailure({ httpStatus: 500, message: 'err', stage: 'AUTHORITY' }),
          3,
          3,
        ),
      ).toBe('TERMINAL_FAILED');
    });

  it('aborts run on 401 from authority', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      h.fakeServer.registerInstance(inst.instanceId, {
        authorityStatus: 401,
        authorityError: 'Unauthorized',
      });
      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-401',
      });

      const result = await h.executorFor('runner-401').execute(claimed!, inst);
      expect(result.abortRun).toBe(true);
      expect(result.status).toBe('TERMINAL_FAILED');
    });

  it('resumes from shadow artifact when DB lags at AUTHORITY_COMPLETED', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];
      const artifactDir = instanceArtifactDir(benchmarkRunId, inst.instanceId);

      const shadow = buildFakeShadowEvent({
        comparisonId: 'cmp_manual',
        decisionRunId: exec.requestId,
        tripId: inst.tripId,
        eligible: true,
        divergenceTypes: ['DIFFERENT_WINNER'],
        authorityWinner: 'cand-a',
        shadowWinner: 'cand-b',
      });
      await writeAuthorityArtifactOnly({
        benchmarkRunId,
        instanceId: inst.instanceId,
        requestId: exec.requestId,
      });
      await writeArtifact(artifactDir, 'shadow-event.json', shadow);

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-shadow-artifact',
      });

      const matBefore = h.fakeServer.metrics.materializeRequestCount;
      const result = await h.executorFor('runner-shadow-artifact').execute(claimed!, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.materializeRequestCount).toBe(matBefore + 1);

      const after = await reloadExecution(h.store, exec.id);
      expect(after.status).toBe('COMPLETED');
      expect(after.comparisonId).toBe('cmp_manual');
  });
});
