/**
 * Harness 在线质量环 SSOT：L1 smoke + decision-closure golden + badcase catalog 快照。
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const HARNESS_QUALITY_LOOP_RUN_SCHEMA = 'tripnara.harness_quality_loop_run@v1' as const;
export const HARNESS_QUALITY_LOOP_SNAPSHOT_SCHEMA = 'tripnara.harness_quality_loop@v1' as const;

export interface HarnessQualityLoopLastRunV1 {
  schemaId: typeof HARNESS_QUALITY_LOOP_RUN_SCHEMA;
  version: 1;
  started_at: string;
  finished_at: string;
  l1_smoke: {
    passed: boolean;
    path_fingerprint: string | null;
    baseline_match: boolean | null;
    errors: string[];
  };
  decision_closure: {
    passed: boolean;
    jest_pattern: string;
    message?: string;
  };
  overall_passed: boolean;
}

export interface HarnessQualityLoopSnapshotV1 {
  schemaId: typeof HARNESS_QUALITY_LOOP_SNAPSHOT_SCHEMA;
  version: 1;
  context_lint_enabled: boolean;
  context_lint_strict: boolean;
  quality_sample_rate: number;
  l1_suite_id: string;
  l1_baseline_pinned: boolean;
  l1_path_fingerprint_baseline: string | null;
  decision_closure_fixture_count: number;
  badcase_catalog_entries: number;
  last_run: HarnessQualityLoopLastRunV1 | null;
  ops_readiness: {
    ready: boolean;
    blockers: string[];
  };
}

export interface HarnessQualitySampleObservabilityV1 {
  schemaId: 'tripnara.harness_quality_sample@v1';
  version: 1;
  enabled: boolean;
  sampled: boolean;
  sample_rate: number;
  cohort: 'quality_loop';
}

export function parseContextLintEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ORCHESTRATOR_CONTEXT_LINT_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

export function parseContextLintStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.ORCHESTRATOR_CONTEXT_LINT_STRICT?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

export function parseHarnessQualitySampleRate(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HARNESS_QUALITY_SAMPLE_RATE?.trim();
  if (!raw) return 0;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(1, n);
}

/** 稳定按 requestId 哈希采样（可复现 cohort）。 */
export function shouldSampleHarnessQuality(requestId: string, rate: number): boolean {
  if (rate <= 0) return false;
  const rid = requestId?.trim();
  if (!rid) return false;
  const hash = createHash('sha256').update(rid).digest();
  const bucket = hash.readUInt32BE(0) / 0xffffffff;
  return bucket < rate;
}

export function buildHarnessQualitySampleObservability(params: {
  requestId: string;
  sampleRate?: number;
}): HarnessQualitySampleObservabilityV1 {
  const sampleRate = params.sampleRate ?? parseHarnessQualitySampleRate();
  const enabled = sampleRate > 0;
  return {
    schemaId: 'tripnara.harness_quality_sample@v1',
    version: 1,
    enabled,
    sampled: enabled && shouldSampleHarnessQuality(params.requestId, sampleRate),
    sample_rate: sampleRate,
    cohort: 'quality_loop',
  };
}

export function defaultQualityLoopReportPath(cwd = process.cwd()): string {
  const dir = process.env.HARNESS_QUALITY_LOOP_REPORT_DIR?.trim() || 'artifacts/harness-quality-loop';
  const absDir = path.isAbsolute(dir) ? dir : path.join(cwd, dir);
  return path.join(absDir, 'last-run.json');
}

export function defaultBadcaseCatalogPath(cwd = process.cwd()): string {
  const dir =
    process.env.HARNESS_BADCASE_CATALOG_DIR?.trim() || path.join('artifacts', 'harness-badcases');
  return path.isAbsolute(dir)
    ? path.join(dir, 'catalog.json')
    : path.join(cwd, dir, 'catalog.json');
}

export function readLiteSmokeSuiteMeta(cwd = process.cwd()): {
  suiteId: string;
  baseline: string | null;
} {
  const suitePath = path.join(cwd, 'fixtures', 'harness', 'eval', 'suites', 'lite-smoke-suite.json');
  if (!fs.existsSync(suitePath)) {
    return { suiteId: 'lite-smoke-suite', baseline: null };
  }
  const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8')) as {
    suiteId?: string;
    pathFingerprintBaseline?: string;
  };
  return {
    suiteId: suite.suiteId ?? 'lite-smoke-suite',
    baseline: suite.pathFingerprintBaseline?.trim() || null,
  };
}

export function countBadcaseCatalogEntries(catalogPath: string): number {
  if (!fs.existsSync(catalogPath)) return 0;
  try {
    const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { entries?: unknown[] };
    return Array.isArray(parsed.entries) ? parsed.entries.length : 0;
  } catch {
    return 0;
  }
}

export function loadQualityLoopLastRun(reportPath: string): HarnessQualityLoopLastRunV1 | null {
  if (!fs.existsSync(reportPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as HarnessQualityLoopLastRunV1;
    if (parsed?.schemaId !== HARNESS_QUALITY_LOOP_RUN_SCHEMA) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveQualityLoopLastRun(
  reportPath: string,
  report: HarnessQualityLoopLastRunV1,
): void {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

export function buildHarnessQualityLoopSnapshot(params: {
  decisionClosureFixtureCount: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): HarnessQualityLoopSnapshotV1 {
  const cwd = params.cwd ?? process.cwd();
  const env = params.env ?? process.env;
  const lintEnabled = parseContextLintEnabled(env);
  const lintStrict = parseContextLintStrict(env);
  const sampleRate = parseHarnessQualitySampleRate(env);
  const l1 = readLiteSmokeSuiteMeta(cwd);
  const badcaseCount = countBadcaseCatalogEntries(defaultBadcaseCatalogPath(cwd));
  const lastRun = loadQualityLoopLastRun(defaultQualityLoopReportPath(cwd));

  const blockers: string[] = [];
  if (!lintEnabled) blockers.push('ORCHESTRATOR_CONTEXT_LINT_ENABLED_off');
  if (!lintStrict) blockers.push('ORCHESTRATOR_CONTEXT_LINT_STRICT_off');
  if (!l1.baseline) blockers.push('l1_pathFingerprintBaseline_unset');
  if (!lastRun) blockers.push('no_quality_loop_last_run');
  else if (!lastRun.overall_passed) blockers.push('last_quality_loop_run_failed');

  const ready =
    lintEnabled &&
    lintStrict &&
    Boolean(l1.baseline) &&
    Boolean(lastRun?.overall_passed);

  return {
    schemaId: HARNESS_QUALITY_LOOP_SNAPSHOT_SCHEMA,
    version: 1,
    context_lint_enabled: lintEnabled,
    context_lint_strict: lintStrict,
    quality_sample_rate: sampleRate,
    l1_suite_id: l1.suiteId,
    l1_baseline_pinned: Boolean(l1.baseline),
    l1_path_fingerprint_baseline: l1.baseline,
    decision_closure_fixture_count: params.decisionClosureFixtureCount,
    badcase_catalog_entries: badcaseCount,
    last_run: lastRun,
    ops_readiness: { ready, blockers },
  };
}
