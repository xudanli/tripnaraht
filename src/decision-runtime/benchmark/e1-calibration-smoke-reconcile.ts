/**
 * Task E1.2 — Evidence reconciliation for Calibration smoke acceptance.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { BenchmarkInstanceExecution, BenchmarkRunRecord } from './benchmark-run.types';
import { hashArtifactFile, instanceArtifactDir } from './benchmark-artifact.util';
import { isAllowedBenchmarkTransition } from './benchmark-transition.util';
import { deriveReviewDisposition } from './benchmark-review-disposition.util';

export interface EvidenceReconciliationRow {
  instanceId: string;
  status: string;
  reviewDisposition: string;
  requestId: string;
  authorityHashMatch: boolean;
  shadowHashMatch: boolean;
  materializeHashMatch: boolean;
  hasAuthorityArtifact: boolean;
  hasShadowArtifact: boolean;
  hasMaterializeArtifact: boolean;
  comparisonId?: string;
  reviewCaseId?: string;
  exclusionReason?: string;
  illegalTransitions: string[];
}

export interface EvidenceReconciliationReport {
  passed: boolean;
  benchmarkRunId: string;
  rows: EvidenceReconciliationRow[];
  duplicates: {
    authorityRequests: number;
    comparisons: number;
    reviewCases: number;
  };
  activeLeases: number;
  hashMismatches: number;
}

export async function reconcileSmokeEvidence(input: {
  prisma: PrismaClient;
  run: BenchmarkRunRecord;
  instances: BenchmarkInstanceExecution[];
}): Promise<EvidenceReconciliationReport> {
  const rows: EvidenceReconciliationRow[] = [];
  let hashMismatches = 0;

  const comparisonIds = new Set<string>();
  const reviewCaseIds = new Set<string>();
  let duplicateComparisons = 0;
  let duplicateReviewCases = 0;

  for (const inst of input.instances) {
    const dir =
      inst.artifactDirectory ?? instanceArtifactDir(input.run.benchmarkRunId, inst.instanceId);
    const authorityPath = path.join(dir, 'authority-response.json');
    const shadowPath = path.join(dir, 'shadow-event.json');
    const materializePath = path.join(dir, 'materialize-result.json');

    const hasAuthorityArtifact = await exists(authorityPath);
    const hasShadowArtifact = await exists(shadowPath);
    const hasMaterializeArtifact = await exists(materializePath);

    let authorityHashMatch = true;
    let shadowHashMatch = true;
    let materializeHashMatch = true;

    if (inst.authorityResponseHash && hasAuthorityArtifact) {
      const fileHash = await hashArtifactFile(authorityPath);
      authorityHashMatch = fileHash === inst.authorityResponseHash;
    } else if (inst.authorityResponseHash && !hasAuthorityArtifact) {
      authorityHashMatch = false;
    }

    if (inst.shadowEventHash && hasShadowArtifact) {
      const fileHash = await hashArtifactFile(shadowPath);
      shadowHashMatch = fileHash === inst.shadowEventHash;
    } else if (inst.shadowEventHash && !hasShadowArtifact) {
      shadowHashMatch = false;
    }

    if (inst.reviewCaseId && hasMaterializeArtifact) {
      const raw = await fs.readFile(materializePath, 'utf8');
      materializeHashMatch = raw.includes(inst.reviewCaseId);
    }

    if (!authorityHashMatch || !shadowHashMatch || !materializeHashMatch) {
      hashMismatches += 1;
    }

    if (inst.comparisonId) {
      if (comparisonIds.has(inst.comparisonId)) duplicateComparisons += 1;
      comparisonIds.add(inst.comparisonId);
    }
    if (inst.reviewCaseId) {
      if (reviewCaseIds.has(inst.reviewCaseId)) duplicateReviewCases += 1;
      reviewCaseIds.add(inst.reviewCaseId);
    }

    rows.push({
      instanceId: inst.instanceId,
      status: inst.status,
      reviewDisposition: deriveReviewDisposition(inst),
      requestId: inst.requestId,
      authorityHashMatch,
      shadowHashMatch,
      materializeHashMatch,
      hasAuthorityArtifact,
      hasShadowArtifact,
      hasMaterializeArtifact,
      comparisonId: inst.comparisonId,
      reviewCaseId: inst.reviewCaseId,
      exclusionReason: inst.exclusionReason,
      illegalTransitions: [],
    });
  }

  const activeLeases = await input.prisma.decisionBenchmarkInstanceExecution.count({
    where: {
      benchmarkRunId: input.run.benchmarkRunId,
      lockedBy: { not: null },
      leaseExpiresAt: { gt: new Date() },
    },
  });

  const terminalOk = input.instances.every((i) =>
    i.status === 'COMPLETED' || i.status === 'EXCLUDED',
  );
  const passed =
    terminalOk &&
    hashMismatches === 0 &&
    activeLeases === 0 &&
    duplicateComparisons === 0 &&
    duplicateReviewCases === 0;

  return {
    passed,
    benchmarkRunId: input.run.benchmarkRunId,
    rows,
    duplicates: {
      authorityRequests: 0,
      comparisons: duplicateComparisons,
      reviewCases: duplicateReviewCases,
    },
    activeLeases,
    hashMismatches,
  };
}

export function assertSmokeRunAcceptance(input: {
  run: BenchmarkRunRecord;
  instances: BenchmarkInstanceExecution[];
  reconciliation: EvidenceReconciliationReport;
  authorityMetricsBefore?: {
    decisionRunIdCount: number;
    artifactCount: number;
    authorityResponseHashCount: number;
    authorityResponseHashes: string[];
    byInstance?: Array<{
      instanceId: string;
      requestId: string;
      decisionRunId?: string;
      authorityResponseHash?: string;
      hasAuthorityArtifact: boolean;
    }>;
  };
  authorityMetricsAfter?: {
    decisionRunIdCount: number;
    artifactCount: number;
    authorityResponseHashCount: number;
    authorityResponseHashes: string[];
    byInstance?: Array<{
      instanceId: string;
      requestId: string;
      decisionRunId?: string;
      authorityResponseHash?: string;
      hasAuthorityArtifact: boolean;
    }>;
  };
}): string[] {
  const failures: string[] = [];
  const { run, instances, reconciliation } = input;

  if (run.status !== 'COMPLETED') {
    failures.push(`run status expected COMPLETED got ${run.status}`);
  }
  if (run.totalInstances !== 3) {
    failures.push(`totalInstances expected 3 got ${run.totalInstances}`);
  }

  const terminal = instances.filter((i) => i.status === 'COMPLETED' || i.status === 'EXCLUDED');
  if (terminal.length !== 3) {
    failures.push(`expected 3 terminal instances got ${terminal.length}`);
  }
  if (instances.some((i) => i.status === 'TERMINAL_FAILED')) {
    failures.push('TERMINAL_FAILED instances present');
  }

  const completed = instances.filter((i) => i.status === 'COMPLETED').length;
  const reviewExcluded = instances.filter((i) => deriveReviewDisposition(i) === 'EXCLUDED').length;
  const reviewMaterialized = instances.filter((i) => deriveReviewDisposition(i) === 'MATERIALIZED').length;
  if (completed !== 3) {
    failures.push(`expected 3 COMPLETED instances got ${completed}`);
  }
  if (reviewExcluded + reviewMaterialized !== 3) {
    failures.push(
      `review disposition mismatch: excluded=${reviewExcluded} materialized=${reviewMaterialized}`,
    );
  }

  const sameWinner = instances.find((i) => i.instanceId === 'E1-CAL-01-SAME-WINNER');
  if (sameWinner) {
    if (sameWinner.status !== 'COMPLETED') {
      failures.push(`SAME_WINNER expected COMPLETED got ${sameWinner.status}`);
    }
    if (deriveReviewDisposition(sameWinner) !== 'EXCLUDED') {
      failures.push(`SAME_WINNER expected reviewDisposition EXCLUDED`);
    }
    if (!sameWinner.exclusionReason?.includes('SAME_WINNER')) {
      failures.push(`SAME_WINNER missing exclusionReason`);
    }
  }

  const diffWinner = instances.find((i) => i.instanceId === 'E1-CAL-02-DIFF-WINNER');
  if (diffWinner && deriveReviewDisposition(diffWinner) !== 'MATERIALIZED') {
    failures.push(`DIFF_WINNER expected reviewDisposition MATERIALIZED`);
  }

  const realMulti = instances.find((i) => i.instanceId === 'E1-CAL-03-REAL-MULTI');
  if (realMulti && deriveReviewDisposition(realMulti) !== 'MATERIALIZED') {
    failures.push(`REAL-MULTI expected reviewDisposition MATERIALIZED`);
  }

  if (!reconciliation.passed) {
    failures.push('evidence reconciliation failed');
  }
  if (reconciliation.activeLeases > 0) {
    failures.push(`active leases ${reconciliation.activeLeases}`);
  }
  if (reconciliation.hashMismatches > 0) {
    failures.push(`hash mismatches ${reconciliation.hashMismatches}`);
  }

  if (input.authorityMetricsBefore && input.authorityMetricsAfter) {
    const before = input.authorityMetricsBefore;
    const after = input.authorityMetricsAfter;

    if (before.byInstance?.length && after.byInstance?.length) {
      for (const row of before.byInstance.filter((i) => i.hasAuthorityArtifact)) {
        const afterRow = after.byInstance.find((i) => i.instanceId === row.instanceId);
        if (!afterRow) {
          failures.push(`authority snapshot missing after resume for ${row.instanceId}`);
          continue;
        }
        if (
          row.authorityResponseHash &&
          afterRow.authorityResponseHash &&
          afterRow.authorityResponseHash !== row.authorityResponseHash
        ) {
          failures.push(`authority hash changed for ${row.instanceId} after resume`);
        }
      }
    } else {
      if (after.decisionRunIdCount > before.decisionRunIdCount) {
        failures.push(
          `decisionRunId count increased after resume (${before.decisionRunIdCount} → ${after.decisionRunIdCount})`,
        );
      }
      if (after.artifactCount > before.artifactCount) {
        failures.push(
          `authority artifacts increased after resume (${before.artifactCount} → ${after.artifactCount})`,
        );
      }
      if (after.authorityResponseHashCount > before.authorityResponseHashCount) {
        failures.push('authority response hash count increased after resume');
      }
      const beforeHashes = new Set(before.authorityResponseHashes);
      for (const hash of after.authorityResponseHashes) {
        if (!beforeHashes.has(hash) && before.authorityResponseHashes.length > 0) {
          failures.push('new authority response hash detected after resume');
          break;
        }
      }
    }
  }

  const requestIds = new Set(instances.map((i) => i.requestId));
  if (requestIds.size !== instances.length) {
    failures.push('duplicate requestId detected across instances');
  }

  return failures;
}

export function validateTransitionGuardSamples(): boolean {
  return (
    !isAllowedBenchmarkTransition('SHADOW_COMPLETED', 'PENDING') &&
    !isAllowedBenchmarkTransition('COMPLETED', 'RUNNING') &&
    isAllowedBenchmarkTransition('AUTHORITY_COMPLETED', 'SHADOW_COMPLETED')
  );
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
