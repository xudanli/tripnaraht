import type { CgusReplayReportKind, FingerprintCompleteness } from '../fingerprint/eval-fingerprint.util';
import { validateRunFingerprintCompleteness } from '../fingerprint/eval-fingerprint.util';

export type CgusFingerprintComparisonClass =
  | 'PURE_CODE_REGRESSION'
  | 'CONFIG_DIFF'
  | 'MAPPING_DIFF'
  | 'CORPUS_SEED_OR_COMMIT_DIFF'
  | 'INCOMPLETE_FINGERPRINT'
  | 'MIXED_ATTRIBUTION_DIFF';

export type CgusFingerprintGateRecommendation = 'PASS' | 'REVIEW' | 'BLOCK';

export function stringifyDistinct(distinct: unknown): string {
  if (!Array.isArray(distinct)) return '';
  return distinct.map(String).sort().join('|');
}

export function inferCgusReplayReportKind(report: unknown): CgusReplayReportKind {
  const r = report as Record<string, unknown>;
  if (r?.mode === 'fixtures' || String((r?.observability as any)?.corpus ?? '').startsWith('td-replay-fixtures')) {
    return 'td-replay-fixtures';
  }
  return 'cgus-suite';
}

export function compareRunFingerprints(
  baseline: unknown,
  current: unknown,
): {
  warnings: string[];
  fingerprintDiff: Record<string, unknown>;
  regressionInterpretation: Record<string, unknown>;
} {
  const warnings: string[] = [];
  const b = (baseline as any)?.runFingerprint;
  const c = (current as any)?.runFingerprint;
  if (!b || !c) {
    if (!b && !c) warnings.push('Neither report has runFingerprint.');
    else if (!b) warnings.push('Baseline missing runFingerprint.');
    else warnings.push('Current missing runFingerprint.');
    return {
      warnings,
      fingerprintDiff: { baselinePresent: !!b, currentPresent: !!c },
      regressionInterpretation: {},
    };
  }

  const fingerprintDiff: Record<string, unknown> = {
    configHash: { baseline: b.configHash, current: c.configHash, same: b.configHash === c.configHash },
    mappingVersion: {
      baseline: b.mappingVersion,
      current: c.mappingVersion,
      same: b.mappingVersion === c.mappingVersion,
    },
    gitSha: { baseline: b.gitSha, current: c.gitSha, same: b.gitSha === c.gitSha },
    seed: { baseline: b.seed, current: c.seed, same: b.seed === c.seed },
  };

  const bv = stringifyDistinct(b.fixtureVersionsDistinct);
  const cv = stringifyDistinct(c.fixtureVersionsDistinct);
  fingerprintDiff.fixtureVersionsDistinct = { baseline: bv, current: cv, same: bv === cv };
  fingerprintDiff.runId = { baseline: b.runId ?? null, current: c.runId ?? null };

  const regressionInterpretation: Record<string, unknown> = {};
  if (bv !== cv) {
    warnings.push(`Fixture version sets differ: "${bv}" vs "${cv}".`);
  }
  if (b.configHash !== c.configHash) {
    warnings.push('configHash differs — not a pure code regression diff.');
    regressionInterpretation.configHash = {
      tag: 'NON_PURE_CODE_REGRESSION',
      labelZh: '非纯代码回归比较',
    };
  }
  if (b.mappingVersion !== c.mappingVersion) {
    warnings.push('mappingVersion differs.');
    regressionInterpretation.mappingVersion = {
      tag: 'MAPPING_PATH_DIFF',
      labelZh: '含参数映射差异',
    };
  }

  fingerprintDiff.identicalFingerprintBundle = Boolean(
    b.gitSha &&
      b.gitSha === c.gitSha &&
      b.configHash === c.configHash &&
      b.mappingVersion === c.mappingVersion &&
      bv === cv &&
      b.seed === c.seed,
  );

  return { warnings, fingerprintDiff, regressionInterpretation };
}

export function deriveComparisonSummary(opts: {
  completenessB: FingerprintCompleteness;
  completenessC: FingerprintCompleteness;
  baseline: unknown;
  current: unknown;
}): {
  schemaVersion: 'cgus-replay-comparison-summary/v1';
  comparisonClass: CgusFingerprintComparisonClass;
  gateRecommendation: CgusFingerprintGateRecommendation;
  reasons: string[];
} {
  const reasons: string[] = [];
  const { completenessB, completenessC, baseline, current } = opts;

  if (!completenessB.ok || !completenessC.ok) {
    if (!completenessB.ok) reasons.push(...completenessB.errors.map((e) => `baseline:${e}`));
    if (!completenessC.ok) reasons.push(...completenessC.errors.map((e) => `current:${e}`));
    return {
      schemaVersion: 'cgus-replay-comparison-summary/v1',
      comparisonClass: 'INCOMPLETE_FINGERPRINT',
      gateRecommendation: 'BLOCK',
      reasons,
    };
  }

  const b = (baseline as any)?.runFingerprint;
  const c = (current as any)?.runFingerprint;
  if (!b || !c) {
    reasons.push('runFingerprint missing on one or both sides');
    return {
      schemaVersion: 'cgus-replay-comparison-summary/v1',
      comparisonClass: 'INCOMPLETE_FINGERPRINT',
      gateRecommendation: 'BLOCK',
      reasons,
    };
  }

  const configDiff = b.configHash !== c.configHash;
  const mappingDiff = b.mappingVersion !== c.mappingVersion;
  const fixtureDiff =
    stringifyDistinct(b.fixtureVersionsDistinct) !== stringifyDistinct(c.fixtureVersionsDistinct);
  const seedDiff = (b.seed ?? null) !== (c.seed ?? null);
  const gitDiff = (b.gitSha ?? null) !== (c.gitSha ?? null);

  if (configDiff) reasons.push('configHash differs');
  if (mappingDiff) reasons.push('mappingVersion differs');
  if (fixtureDiff) reasons.push('fixtureVersionsDistinct differs');
  if (seedDiff) reasons.push('seed differs');
  if (gitDiff) reasons.push('gitSha differs');

  if (configDiff && mappingDiff) {
    return {
      schemaVersion: 'cgus-replay-comparison-summary/v1',
      comparisonClass: 'MIXED_ATTRIBUTION_DIFF',
      gateRecommendation: 'REVIEW',
      reasons,
    };
  }
  if (mappingDiff) {
    return {
      schemaVersion: 'cgus-replay-comparison-summary/v1',
      comparisonClass: 'MAPPING_DIFF',
      gateRecommendation: 'REVIEW',
      reasons,
    };
  }
  if (configDiff) {
    return {
      schemaVersion: 'cgus-replay-comparison-summary/v1',
      comparisonClass: 'CONFIG_DIFF',
      gateRecommendation: 'REVIEW',
      reasons,
    };
  }
  if (fixtureDiff || seedDiff || gitDiff) {
    return {
      schemaVersion: 'cgus-replay-comparison-summary/v1',
      comparisonClass: 'CORPUS_SEED_OR_COMMIT_DIFF',
      gateRecommendation: 'REVIEW',
      reasons,
    };
  }

  return {
    schemaVersion: 'cgus-replay-comparison-summary/v1',
    comparisonClass: 'PURE_CODE_REGRESSION',
    gateRecommendation: 'PASS',
    reasons,
  };
}

export function compareCgusReplayReports(baseline: unknown, current: unknown): {
  comparisonSummary: ReturnType<typeof deriveComparisonSummary>;
  fingerprintComparison: ReturnType<typeof compareRunFingerprints> & {
    completeness: { baseline: FingerprintCompleteness; current: FingerprintCompleteness };
  };
} {
  const kindB = inferCgusReplayReportKind(baseline);
  const kindC = inferCgusReplayReportKind(current);
  const caseCountB =
    (baseline as any)?.observability?.caseCount ??
    (baseline as any)?.n ??
    (baseline as any)?.results?.length ??
    0;
  const caseCountC =
    (current as any)?.observability?.caseCount ??
    (current as any)?.n ??
    (current as any)?.results?.length ??
    0;

  const completenessB = validateRunFingerprintCompleteness({
    reportKind: kindB,
    caseCount: caseCountB,
    fp: (baseline as any)?.runFingerprint,
  });
  const completenessC = validateRunFingerprintCompleteness({
    reportKind: kindC,
    caseCount: caseCountC,
    fp: (current as any)?.runFingerprint,
  });

  const { warnings, fingerprintDiff, regressionInterpretation } = compareRunFingerprints(
    baseline,
    current,
  );
  const comparisonSummary = deriveComparisonSummary({
    completenessB,
    completenessC,
    baseline,
    current,
  });

  return {
    comparisonSummary,
    fingerprintComparison: {
      warnings,
      fingerprintDiff,
      regressionInterpretation,
      completeness: { baseline: completenessB, current: completenessC },
    },
  };
}
