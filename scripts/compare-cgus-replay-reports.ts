#!/usr/bin/env npx ts-node
/**
 * 对比两份 CGUS 重放 JSON 报告（套件或 TD 测试固件）。
 *
 * 官方基线命名、晋升流程及**回归差异解读模板**：baselines/cgus/README.md
 *
 * 使用方法：
 *   npx ts-node --transpile-only scripts/compare-cgus-replay-reports.ts <基线文件.json> <当前文件.json> [--out artifacts/cgus-replay-diff.json]
 *
 * 当存在 `observability` 时优先读取；否则回退使用 `aggregates.rankAuthority` 获取总体比率。
 * 逐用例的排序差异需要 `results[].rankReplaySnapshot` 字段（由重放脚本生成）。
 *
 * `CGUS_COMPARE_FP_STRICT=1`：任一侧 `validateRunFingerprintCompleteness` 含 error 时以退出码 2 失败（可作 release gate）。
 * `CGUS_COMPARE_GATE_POLICY=fail_on_review`：`gateRecommendation === 'REVIEW'` 时退出码 4（发布线：归因类差异须人工过审）。
 *
 * 当报告含 `traceRefs` 时，diff 附带 **`traceHints`**（`caseId` → `baselineTrace` / `currentTrace`），便于从 compare 跳回执行层关联 id。
 */
import fs from 'fs';
import path from 'path';
import type { CgusReplayReportKind, FingerprintCompleteness } from './lib/harness-run-fingerprint';
import { validateRunFingerprintCompleteness } from './lib/harness-run-fingerprint';

type Rates = {
  mcEligibleRate: number;
  winnerChangedRate: number;
  winnerLockedButTopNChangedRate: number;
  marginBlockedFlipRate: number;
};

type Snapshot = {
  compareTopN?: number;
  deterministicTopN?: string[];
  finalTopN?: string[];
};

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function extractRates(report: any): Rates {
  const o = report?.observability?.rankAuthorityRates;
  if (o && typeof o.mcEligibleRate === 'number') {
    return {
      mcEligibleRate: o.mcEligibleRate,
      winnerChangedRate: o.winnerChangedRate,
      winnerLockedButTopNChangedRate: o.winnerLockedButTopNChangedRate,
      marginBlockedFlipRate: o.marginBlockedFlipRate,
    };
  }
  const ra = report?.aggregates?.rankAuthority;
  if (ra && typeof ra.mcEligibleRate === 'number') {
    return {
      mcEligibleRate: ra.mcEligibleRate,
      winnerChangedRate: ra.winnerChangedRate,
      winnerLockedButTopNChangedRate: ra.winnerLockedButTopNChangedRate,
      marginBlockedFlipRate: ra.marginBlockedFlipRate,
    };
  }
  throw new Error('Cannot extract rank authority rates from report (missing observability + aggregates.rankAuthority)');
}

function extractMeta(report: any, label: string) {
  const legacyCorpus =
    report?.configSnapshot?.mode != null
      ? `cgus-suite:${report.configSnapshot.mode}:${report.configSnapshot.suiteProfile ?? 'lite'}`
      : report?.mode ?? null;
  const fp = report?.runFingerprint;
  return {
    label,
    generatedAt: report?.observability?.generatedAt ?? report?.generatedAt,
    corpus: report?.observability?.corpus ?? legacyCorpus,
    caseCount: report?.observability?.caseCount ?? report?.n ?? report?.results?.length ?? null,
    fixtureVersion: report?.observability?.fixtureVersion ?? null,
    runFingerprint: fp
      ? {
          configHash: fp.configHash ?? null,
          mappingVersion: fp.mappingVersion ?? null,
          gitSha: fp.gitSha ?? null,
          seed: fp.seed ?? null,
          runId: fp.runId ?? null,
          fixtureVersionsDistinct: fp.fixtureVersionsDistinct ?? null,
        }
      : null,
  };
}

function inferReportKind(report: any): CgusReplayReportKind {
  if (report?.mode === 'fixtures' || String(report?.observability?.corpus ?? '').startsWith('td-replay-fixtures')) {
    return 'td-replay-fixtures';
  }
  return 'cgus-suite';
}

function compareRunFingerprints(baseline: any, current: any): {
  warnings: string[];
  fingerprintDiff: Record<string, unknown>;
  regressionInterpretation: Record<string, unknown>;
} {
  const warnings: string[] = [];
  const b = baseline?.runFingerprint;
  const c = current?.runFingerprint;
  if (!b || !c) {
    if (!b && !c) warnings.push('Neither report has runFingerprint (re-run with latest replay-cgus-suite).');
    else if (!b) warnings.push('Baseline missing runFingerprint — comparison is not fully attributable.');
    else warnings.push('Current missing runFingerprint — comparison is not fully attributable.');
    return {
      warnings,
      fingerprintDiff: { baselinePresent: !!b, currentPresent: !!c },
      regressionInterpretation: {},
    };
  }

  const fingerprintDiff: Record<string, unknown> = {
    configHash: { baseline: b.configHash, current: c.configHash, same: b.configHash === c.configHash },
    mappingVersion: { baseline: b.mappingVersion, current: c.mappingVersion, same: b.mappingVersion === c.mappingVersion },
    gitSha: { baseline: b.gitSha, current: c.gitSha, same: b.gitSha === c.gitSha },
    seed: { baseline: b.seed, current: c.seed, same: b.seed === c.seed },
  };

  const bv = stringifyDistinct(b.fixtureVersionsDistinct);
  const cv = stringifyDistinct(c.fixtureVersionsDistinct);
  fingerprintDiff.fixtureVersionsDistinct = { baseline: bv, current: cv, same: bv === cv };
  fingerprintDiff.runId = { baseline: b.runId ?? null, current: c.runId ?? null };

  const regressionInterpretation: Record<string, unknown> = {};

  if (bv !== cv) {
    warnings.push(
      `Fixture version sets differ (baseline vs current). Diff may mix different corpora/fixtures: "${bv}" vs "${cv}".`,
    );
  }
  if (b.configHash !== c.configHash) {
    warnings.push('configHash differs — not a pure code regression diff; optimizer/MC/env replay config changed between runs.');
    regressionInterpretation.configHash = {
      tag: 'NON_PURE_CODE_REGRESSION',
      labelZh: '非纯代码回归比较',
      detailZh: 'configHash 不一致：差异可能来自 optimizer / MC / 采样规模 / 脚本参数或环境，不应仅归因为算法实现改动。',
    };
  }
  if (b.mappingVersion !== c.mappingVersion) {
    warnings.push('mappingVersion differs — DecisionParams mapping path may differ (legacy vs v2 / shadow).');
    regressionInterpretation.mappingVersion = {
      tag: 'MAPPING_PATH_DIFF',
      labelZh: '含参数映射差异，结果不可直接归因为算法变化',
      detailZh: 'mappingVersion 不一致（legacy / v2 / shadow 等）：对比结论须先排除 DecisionParams 映射与画像口径漂移。',
    };
  }
  if (b.gitSha && c.gitSha && b.gitSha !== c.gitSha) {
    warnings.push('gitSha differs — baseline and current were produced from different commits.');
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

function stringifyDistinct(distinct: unknown): string {
  if (!Array.isArray(distinct)) return '';
  return distinct.map(String).sort().join('|');
}

type IndexedTraceRef = { runId: string; traceId: string | null; path: string | null };

function indexTraceRefsByCaseId(report: any): Map<string, IndexedTraceRef> {
  const m = new Map<string, IndexedTraceRef>();
  for (const row of report?.traceRefs ?? []) {
    if (row == null || row.caseId == null) continue;
    const caseId = String(row.caseId);
    m.set(caseId, {
      runId: String(row.runId ?? ''),
      traceId: row.traceId != null ? String(row.traceId) : null,
      path: row.path != null ? String(row.path) : null,
    });
  }
  return m;
}

function traceCorrelationHint(ref: IndexedTraceRef | undefined): string | null {
  if (!ref) return null;
  if (ref.path) return ref.path;
  if (ref.traceId) return ref.traceId;
  if (ref.runId) return `run:${ref.runId}`;
  return null;
}

function buildTraceHints(baseline: any, current: any, interestingCaseIds: string[]): Array<{
  caseId: string;
  baselineTrace: string | null;
  currentTrace: string | null;
}> {
  const bMap = indexTraceRefsByCaseId(baseline);
  const cMap = indexTraceRefsByCaseId(current);
  const ids = [...new Set(interestingCaseIds)].sort();
  return ids.map((caseId) => ({
    caseId,
    baselineTrace: traceCorrelationHint(bMap.get(caseId)),
    currentTrace: traceCorrelationHint(cMap.get(caseId)),
  }));
}

function rateDelta(a: number, b: number): number {
  return b - a;
}

type CgusFingerprintComparisonClass =
  | 'PURE_CODE_REGRESSION'
  | 'CONFIG_DIFF'
  | 'MAPPING_DIFF'
  | 'CORPUS_SEED_OR_COMMIT_DIFF'
  | 'INCOMPLETE_FINGERPRINT'
  | 'MIXED_ATTRIBUTION_DIFF';

type CgusFingerprintGateRecommendation = 'PASS' | 'REVIEW' | 'BLOCK';

/**
 * `comparisonClass` 官方优先级（从高到低）。`deriveComparisonSummary` 的分支顺序必须与此一致，避免脚本间漂移。
 * `CORPUS_SEED_OR_COMMIT_DIFF` 保留单列：与 optimizer 参数 / mapping 路径本质不同（语料、随机性、提交点）。
 */
const CGUS_COMPARISON_CLASS_PRIORITY: readonly CgusFingerprintComparisonClass[] = [
  'INCOMPLETE_FINGERPRINT',
  'MIXED_ATTRIBUTION_DIFF',
  'MAPPING_DIFF',
  'CONFIG_DIFF',
  'CORPUS_SEED_OR_COMMIT_DIFF',
  'PURE_CODE_REGRESSION',
];

/**
 * 结论级摘要：供 stdout / CI / gate 机读（与 `regressionInterpretation` 互补）。
 * 判定顺序遵循 {@link CGUS_COMPARISON_CLASS_PRIORITY}。
 */
function deriveComparisonSummary(opts: {
  completenessB: FingerprintCompleteness;
  completenessC: FingerprintCompleteness;
  baseline: any;
  current: any;
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

  const b = baseline?.runFingerprint;
  const c = current?.runFingerprint;
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
  const bv = stringifyDistinct(b.fixtureVersionsDistinct);
  const cv = stringifyDistinct(c.fixtureVersionsDistinct);
  const fixtureDiff = bv !== cv;
  const seedDiff = (b.seed ?? null) !== (c.seed ?? null);
  const gitDiff = (b.gitSha ?? null) !== (c.gitSha ?? null);

  if (configDiff) reasons.push('configHash differs');
  if (mappingDiff) reasons.push('mappingVersion differs');
  if (fixtureDiff) reasons.push('fixtureVersionsDistinct differs');
  if (seedDiff) reasons.push('seed differs');
  if (gitDiff) reasons.push('gitSha differs');

  // 优先级：INCOMPLETE → MIXED → MAPPING（仅）→ CONFIG（仅）→ CORPUS/SEED/GIT → PURE
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

function main() {
  const argv = process.argv.slice(2).filter(Boolean);
  let outPath: string | undefined;
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out' && argv[i + 1]) {
      outPath = argv[i + 1];
      i++;
      continue;
    }
    files.push(argv[i]!);
  }
  if (files.length < 2) {
    process.stderr.write(
      'Usage: compare-cgus-replay-reports.ts <baseline.json> <current.json> [--out diff.json]\n',
    );
    process.exit(1);
  }
  const [baselinePath, currentPath] = files;
  const baseline = readJson(path.isAbsolute(baselinePath) ? baselinePath : path.join(process.cwd(), baselinePath));
  const current = readJson(path.isAbsolute(currentPath) ? currentPath : path.join(process.cwd(), currentPath));

  const ratesB = extractRates(baseline);
  const ratesC = extractRates(current);
  const { warnings: fingerprintWarnings, fingerprintDiff, regressionInterpretation } = compareRunFingerprints(
    baseline,
    current,
  );

  const caseCountB = baseline?.observability?.caseCount ?? baseline?.n ?? baseline?.results?.length ?? 0;
  const caseCountC = current?.observability?.caseCount ?? current?.n ?? current?.results?.length ?? 0;
  const completenessB = validateRunFingerprintCompleteness({
    reportKind: inferReportKind(baseline),
    caseCount: caseCountB,
    fp: baseline?.runFingerprint,
  });
  const completenessC = validateRunFingerprintCompleteness({
    reportKind: inferReportKind(current),
    caseCount: caseCountC,
    fp: current?.runFingerprint,
  });
  const completenessIssues: string[] = [
    ...completenessB.errors.map((e) => `[baseline] ${e}`),
    ...completenessC.errors.map((e) => `[current] ${e}`),
    ...completenessB.warnings.map((w) => `[baseline] ${w}`),
    ...completenessC.warnings.map((w) => `[current] ${w}`),
  ];
  const compareFpStrict = process.env.CGUS_COMPARE_FP_STRICT === '1';

  const comparisonSummaryCore = deriveComparisonSummary({
    completenessB,
    completenessC,
    baseline,
    current,
  });
  const comparisonSummary = {
    ...comparisonSummaryCore,
    comparisonClassPriorityOrder: [...CGUS_COMPARISON_CLASS_PRIORITY],
  };

  const rateKeys: (keyof Rates)[] = [
    'mcEligibleRate',
    'winnerChangedRate',
    'winnerLockedButTopNChangedRate',
    'marginBlockedFlipRate',
  ];

  const rateComparison = Object.fromEntries(
    rateKeys.map((k) => [k, { baseline: ratesB[k], current: ratesC[k], delta: rateDelta(ratesB[k], ratesC[k]) }]),
  ) as Record<keyof Rates, { baseline: number; current: number; delta: number }>;

  const baseById = new Map<string, any>();
  for (const r of baseline.results ?? []) {
    if (r?.id) baseById.set(String(r.id), r);
  }

  const top1Changed: string[] = [];
  const topNChangedWinnerLocked: string[] = [];
  const missingSnapshot: string[] = [];
  const missingInBaseline: string[] = [];

  for (const r of current.results ?? []) {
    const id = r?.id != null ? String(r.id) : '';
    if (!id) continue;
    const br = baseById.get(id);
    if (!br) {
      missingInBaseline.push(id);
      continue;
    }
    const bs: Snapshot | undefined = br.rankReplaySnapshot;
    const cs: Snapshot | undefined = r.rankReplaySnapshot;
    if (!bs?.finalTopN || !cs?.finalTopN) {
      missingSnapshot.push(id);
      continue;
    }
    const b1 = bs.finalTopN[0];
    const c1 = cs.finalTopN[0];
    if (b1 !== c1) top1Changed.push(id);
    else if (bs.finalTopN.join('|') !== cs.finalTopN.join('|')) {
      topNChangedWinnerLocked.push(id);
    }
  }

  const interestingForHints = new Set<string>([
    ...top1Changed,
    ...topNChangedWinnerLocked,
    ...missingInBaseline,
    ...missingSnapshot,
  ]);
  for (const r of baseline.results ?? []) {
    if (r?.id) interestingForHints.add(String(r.id));
  }
  for (const r of current.results ?? []) {
    if (r?.id) interestingForHints.add(String(r.id));
  }
  const traceHints = buildTraceHints(baseline, current, [...interestingForHints]);

  const generatedAt = new Date().toISOString();
  const diff = {
    schemaVersion: 'cgus-replay-report-diff/v1',
    generatedAt,
    baseline: extractMeta(baseline, 'baseline'),
    current: extractMeta(current, 'current'),
    comparisonSummary,
    traceHints,
    fingerprintComparison: {
      warnings: fingerprintWarnings,
      regressionInterpretation,
      completeness: {
        schemaVersion: 'fingerprint-completeness-pair/v1',
        baseline: completenessB,
        current: completenessC,
      },
      ...fingerprintDiff,
    },
    rateComparison,
    cases: {
      top1Changed,
      topNChangedWinnerLocked,
      missingInBaseline,
      missingRankReplaySnapshot: missingSnapshot,
    },
  };

  const summaryLines = [
    `CGUS replay diff (${generatedAt})`,
    `  comparisonClass: ${comparisonSummary.comparisonClass}`,
    `  gateRecommendation: ${comparisonSummary.gateRecommendation}`,
    `  comparisonClassPriorityOrder: ${comparisonSummary.comparisonClassPriorityOrder.join(' > ')}`,
    ...(comparisonSummary.reasons.length
      ? ['  comparison reasons:', ...comparisonSummary.reasons.map((r) => `    - ${r}`), '']
      : []),
    `  baseline: ${diff.baseline.generatedAt} | corpus=${diff.baseline.corpus} | cases=${diff.baseline.caseCount} | fixture=${diff.baseline.fixtureVersion ?? 'n/a'}`,
    `  current:  ${diff.current.generatedAt} | corpus=${diff.current.corpus} | cases=${diff.current.caseCount} | fixture=${diff.current.fixtureVersion ?? 'n/a'}`,
    '',
    ...(fingerprintWarnings.length
      ? ['  Run fingerprint notes:', ...fingerprintWarnings.map((w) => `    - ${w}`), '']
      : []),
    ...(Object.keys(regressionInterpretation).length
      ? [
          '  Regression interpretation (hard prompts):',
          ...Object.entries(regressionInterpretation).map(
            ([k, v]: [string, any]) => `    - ${k}: ${v.labelZh} — ${v.detailZh}`,
          ),
          '',
        ]
      : []),
    ...(completenessIssues.length
      ? ['  Fingerprint completeness:', ...completenessIssues.map((w) => `    - ${w}`), '']
      : []),
    '  Rate deltas (current - baseline):',
    ...rateKeys.map((k) => `    ${k}: ${rateComparison[k].delta.toFixed(4)} (${ratesB[k].toFixed(4)} → ${ratesC[k].toFixed(4)})`),
    '',
    `  Cases final top1 changed: ${top1Changed.length}`,
    ...(top1Changed.length ? top1Changed.slice(0, 20).map((id) => `    - ${id}`) : ['    (none)']),
    ...(top1Changed.length > 20 ? [`    ... +${top1Changed.length - 20} more`] : []),
    '',
    `  Cases top1 same, topN changed: ${topNChangedWinnerLocked.length}`,
    ...(topNChangedWinnerLocked.length ? topNChangedWinnerLocked.slice(0, 20).map((id) => `    - ${id}`) : ['    (none)']),
    ...(topNChangedWinnerLocked.length > 20 ? [`    ... +${topNChangedWinnerLocked.length - 20} more`] : []),
    '',
    `  Missing rankReplaySnapshot (re-run capture with latest replay scripts): ${missingSnapshot.length}`,
    `  Missing in baseline: ${missingInBaseline.length}`,
    '',
    `  Trace hints (case → baseline / current correlation id): ${traceHints.length} row(s)`,
    `    (non-null baselineTrace: ${traceHints.filter((h) => h.baselineTrace != null).length}; currentTrace: ${traceHints.filter((h) => h.currentTrace != null).length})`,
  ];

  if (outPath) {
    const abs = path.isAbsolute(outPath) ? outPath : path.join(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(diff, null, 2), 'utf-8');
    process.stdout.write(`\nWrote diff JSON: ${abs}\n`);
  }

  process.stdout.write(`${summaryLines.join('\n')}\n`);

  if (compareFpStrict && (!completenessB.ok || !completenessC.ok)) {
    process.stderr.write(
      '\nCGUS_COMPARE_FP_STRICT=1: fingerprint completeness errors — exiting with code 2.\n',
    );
    process.exit(2);
  }

  const gatePolicy = (process.env.CGUS_COMPARE_GATE_POLICY ?? 'off').trim().toLowerCase();
  if (gatePolicy === 'fail_on_review' && comparisonSummary.gateRecommendation === 'REVIEW') {
    process.stderr.write(
      '\nCGUS_COMPARE_GATE_POLICY=fail_on_review: gateRecommendation is REVIEW — exiting with code 4.\n',
    );
    process.exit(4);
  }
}

main();
