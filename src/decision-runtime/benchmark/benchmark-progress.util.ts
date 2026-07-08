/**
 * Benchmark run progress + manifest artifacts.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { BenchmarkInstanceExecution, BenchmarkRunRecord } from './benchmark-run.types';

import { getBenchmarkArtifactRoot } from './benchmark-artifact.util';

export function runArtifactRoot(benchmarkRunId: string): string {
  return path.join(getBenchmarkArtifactRoot(), benchmarkRunId);
}

export async function writeRunManifest(
  run: BenchmarkRunRecord,
  instances: BenchmarkInstanceExecution[],
): Promise<string> {
  const root = runArtifactRoot(run.benchmarkRunId);
  await fs.mkdir(root, { recursive: true });
  const manifestPath = path.join(root, 'manifest.json');
  const payload = {
    benchmarkRunId: run.benchmarkRunId,
    configHash: run.configHash,
    datasetChecksum: run.datasetChecksum,
    config: run.config,
    status: run.status,
    totalInstances: run.totalInstances,
    instanceIds: instances.map((i) => i.instanceId),
    forkedFromRunId: run.forkedFromRunId,
    createdAt: run.startedAt,
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2));
  return manifestPath;
}

export async function writeProgressReport(input: {
  run: BenchmarkRunRecord;
  instances: BenchmarkInstanceExecution[];
}): Promise<string> {
  const root = runArtifactRoot(input.run.benchmarkRunId);
  const reportsDir = path.join(root, 'reports');
  await fs.mkdir(reportsDir, { recursive: true });
  const progressPath = path.join(reportsDir, 'benchmark-progress.json');

  const byStatus: Record<string, number> = {};
  for (const inst of input.instances) {
    byStatus[inst.status] = (byStatus[inst.status] ?? 0) + 1;
  }

  const payload = {
    benchmarkRunId: input.run.benchmarkRunId,
    runStatus: input.run.status,
    updatedAt: new Date().toISOString(),
    counters: {
      total: input.instances.length,
      completed: input.run.completedInstances,
      failed: input.run.failedInstances,
      excluded: input.run.excludedInstances,
      byStatus,
    },
    instances: input.instances.map((i) => ({
      instanceId: i.instanceId,
      status: i.status,
      attemptCount: i.attemptCount,
      comparisonId: i.comparisonId,
      reviewCaseId: i.reviewCaseId,
      lastErrorStage: i.lastErrorStage,
      failureClass: i.failureClass,
    })),
  };
  await fs.writeFile(progressPath, JSON.stringify(payload, null, 2));
  return progressPath;
}
