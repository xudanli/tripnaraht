import type { RedisEntityResolutionProvider } from '../../src/agent/providers/redis-entity-resolution.provider';
import {
  ENTITY_RESOLUTION_GOLDEN_SET,
  GOLDEN_SET_BASELINE_THRESHOLDS,
  type EntityResolutionGoldenCase,
  type EntityResolutionGoldenTier,
} from '../fixtures/query-rewrite/entity-resolution-golden-set';

export interface EntityResolutionBenchmarkCaseResult {
  case: EntityResolutionGoldenCase;
  candidates: string[];
  hit: boolean;
  matchedLabel?: string;
}

export interface EntityResolutionBenchmarkReport {
  total: number;
  successCount: number;
  overallAccuracy: number;
  byTier: Record<EntityResolutionGoldenTier, { total: number; hits: number; accuracy: number }>;
  failures: EntityResolutionBenchmarkCaseResult[];
  pipelineMode: string;
}

export async function runEntityResolutionGoldenBenchmark(
  provider: RedisEntityResolutionProvider,
  options?: { pipelineMode?: string },
): Promise<EntityResolutionBenchmarkReport> {
  const results: EntityResolutionBenchmarkCaseResult[] = [];

  for (const caseData of ENTITY_RESOLUTION_GOLDEN_SET) {
    const topN = caseData.topN ?? 5;
    const candidates = await provider.getTopNCandidates(
      caseData.query,
      caseData.scene ?? 'general',
      topN,
    );
    const matchedLabel = caseData.expectedLabels.find((label) => candidates.includes(label));
    results.push({
      case: caseData,
      candidates,
      hit: Boolean(matchedLabel),
      matchedLabel,
    });
  }

  const byTier: EntityResolutionBenchmarkReport['byTier'] = {
    core: { total: 0, hits: 0, accuracy: 0 },
    adversarial: { total: 0, hits: 0, accuracy: 0 },
    stretch: { total: 0, hits: 0, accuracy: 0 },
  };

  for (const r of results) {
    const tier = r.case.tier;
    byTier[tier].total += 1;
    if (r.hit) byTier[tier].hits += 1;
  }

  for (const tier of Object.keys(byTier) as EntityResolutionGoldenTier[]) {
    const bucket = byTier[tier];
    bucket.accuracy = bucket.total ? bucket.hits / bucket.total : 0;
  }

  const successCount = results.filter((r) => r.hit).length;
  const failures = results.filter((r) => !r.hit);

  return {
    total: results.length,
    successCount,
    overallAccuracy: successCount / results.length,
    byTier,
    failures,
    pipelineMode: options?.pipelineMode ?? 'memory-vector+substring-fallback',
  };
}

export function formatBenchmarkReport(report: EntityResolutionBenchmarkReport): string {
  const lines = [
    `\n📊 Entity Resolution Golden Set Benchmark`,
    `   Pipeline: ${report.pipelineMode}`,
    `   Overall: ${(report.overallAccuracy * 100).toFixed(2)}% (${report.successCount}/${report.total})`,
    `   Core:    ${(report.byTier.core.accuracy * 100).toFixed(2)}% (${report.byTier.core.hits}/${report.byTier.core.total})`,
    `   Stretch: ${(report.byTier.stretch.accuracy * 100).toFixed(2)}% (${report.byTier.stretch.hits}/${report.byTier.stretch.total})`,
    `   Adversarial: ${(report.byTier.adversarial.accuracy * 100).toFixed(2)}% (${report.byTier.adversarial.hits}/${report.byTier.adversarial.total})`,
  ];

  if (report.failures.length) {
    lines.push('   Failures:');
    for (const f of report.failures) {
      lines.push(
        `     - [${f.case.tier}] ${f.case.id}: "${f.case.query}" expected one of [${f.case.expectedLabels.join(', ')}] got [${f.candidates.join(', ')}]`,
      );
    }
  }

  return lines.join('\n');
}

export function assertBenchmarkThresholds(report: EntityResolutionBenchmarkReport): void {
  const { coreMinAccuracy, overallMinAccuracy, adversarialMinAccuracy } =
    GOLDEN_SET_BASELINE_THRESHOLDS;

  if (report.byTier.core.accuracy < coreMinAccuracy) {
    throw new Error(
      `Core tier accuracy ${(report.byTier.core.accuracy * 100).toFixed(2)}% < ${coreMinAccuracy * 100}%`,
    );
  }
  if (report.overallAccuracy < overallMinAccuracy) {
    throw new Error(
      `Overall accuracy ${(report.overallAccuracy * 100).toFixed(2)}% < ${overallMinAccuracy * 100}%`,
    );
  }
  if (
    report.byTier.adversarial.total > 0 &&
    report.byTier.adversarial.accuracy < adversarialMinAccuracy
  ) {
    throw new Error(
      `Adversarial tier accuracy ${(report.byTier.adversarial.accuracy * 100).toFixed(2)}% < ${adversarialMinAccuracy * 100}%`,
    );
  }
}
