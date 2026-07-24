/**
 * Materialize resume + idempotency fault injection.
 */

import {
  reloadExecution,
  INTEGRATION_INSTANCES,
  seedShadowCheckpoint,
  forceTerminalStatus,
} from './benchmark-test.harness';
import { instanceArtifactDir, writeArtifact } from '../benchmark-artifact.util';
import {
  setupBenchmarkIntegration,
  assertIntegrationReady,
  type BenchmarkIntegrationContext,
} from './benchmark-integration.guard';

describe('E1 fault injection — materialize resume', () => {
  let ctx: BenchmarkIntegrationContext;

  beforeAll(async () => {
    ctx = await setupBenchmarkIntegration({ sleepFn: () => Promise.resolve() });
  });

  afterAll(async () => {
    await ctx.harness?.dispose();
  });

  it('does not create duplicate review case when materialize artifact exists', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];
      const comparisonId = 'cmp_mat_resume';
      const reviewCaseId = 'rc_existing';

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-mat',
      });
      const seeded = await seedShadowCheckpoint(h.store, claimed!, {
        comparisonId,
        fakeServer: h.fakeServer,
        tripId: inst.tripId,
      });

      const artifactDir = instanceArtifactDir(benchmarkRunId, inst.instanceId);
      await writeArtifact(artifactDir, 'materialize-result.json', {
        reviewCaseId,
        comparisonId,
      });

      const matBefore = h.fakeServer.metrics.materializeRequestCount;
      const row = await reloadExecution(h.store, seeded.id);
      const result = await h.executorFor('runner-mat').execute(row, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.materializeRequestCount).toBe(matBefore);

      const after = await reloadExecution(h.store, exec.id);
      expect(after.reviewCaseId).toBe(reviewCaseId);
    });

  it('materialize API is idempotent for same comparisonId', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-mat-idem',
      });

      const result = await h.executorFor('runner-mat-idem').execute(claimed!, inst);
      expect(result.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.materializeRequestCount).toBe(1);

      const after = await reloadExecution(h.store, exec.id);
      const comparisonId = after.comparisonId!;

      const res = await fetch(`${h.baseConfig.baseUrl}/decision-engine/v1/shadow-reviews/materialize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comparisonIds: [comparisonId] }),
      });
      const json = (await res.json()) as { data: { alreadyExists: number; created: number } };
      expect(json.data.alreadyExists).toBe(1);
      expect(json.data.created).toBe(0);
      expect(h.fakeServer.getReviewCaseId(comparisonId)).toBe(after.reviewCaseId);
    });

  it('EXCLUDED instance does not materialize review case', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-INPUT-MISMATCH')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-excluded',
      });

      const matBefore = h.fakeServer.metrics.materializeRequestCount;
      const result = await h.executorFor('runner-excluded').execute(claimed!, inst);
      expect(result.status).toBe('EXCLUDED');
      expect(h.fakeServer.metrics.materializeRequestCount).toBe(matBefore);

      const after = await reloadExecution(h.store, exec.id);
      expect(after.exclusionReason).toContain('INPUT_MISMATCH');
    });

  it('skips COMPLETED instance on resume', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const inst = INTEGRATION_INSTANCES.find((i) => i.instanceId === 'FI-DIFF-WINNER')!;
      const { benchmarkRunId, instances } = await h.createRun([inst]);
      const exec = instances[0];

      await forceTerminalStatus(h.prisma, exec.id, 'COMPLETED');

      const authorityBefore = h.fakeServer.metrics.authorityRequestCount;
      const claimed = await h.store.claimNextInstance({
        benchmarkRunId,
        runnerId: 'runner-skip-done',
      });
      expect(claimed).toBeUndefined();

      const row = await reloadExecution(h.store, exec.id);
      expect(row.status).toBe('COMPLETED');
      expect(h.fakeServer.metrics.authorityRequestCount).toBe(authorityBefore);
  });
});
