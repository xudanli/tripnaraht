/**
 * 在线质量环 batch：L1 smoke + decision-closure golden → last-run.json
 */
import { execSync } from 'node:child_process';
import {
  HARNESS_QUALITY_LOOP_RUN_SCHEMA,
  defaultQualityLoopReportPath,
  saveQualityLoopLastRun,
  type HarnessQualityLoopLastRunV1,
} from '../src/harness/eval/quality/harness-quality-loop.util';

const DECISION_CLOSURE_PATTERN =
  'src/trips/decision/evaluation/country-decision-closure.spec.ts';

function runCmd(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      encoding: 'utf8',
      stdio: 'pipe',
      env: process.env,
      cwd: process.cwd(),
    });
    return { ok: true, output };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    const output = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n');
    return { ok: false, output };
  }
}

function parseL1Smoke(output: string): {
  pathFingerprint: string | null;
  baselineMatch: boolean | null;
} {
  const fpMatch = output.match(/pathFingerprint=([a-f0-9]+)/i);
  const baselineMatch = output.match(/baselineMatch=(true|false)/i);
  return {
    pathFingerprint: fpMatch?.[1] ?? null,
    baselineMatch: baselineMatch ? baselineMatch[1] === 'true' : null,
  };
}

const startedAt = new Date().toISOString();

const l1 = runCmd('npm run harness:l1-smoke');
const l1Meta = parseL1Smoke(l1.output);

const dc = runCmd(`npx jest "${DECISION_CLOSURE_PATTERN}" --no-cache --ci`);

const finishedAt = new Date().toISOString();
const report: HarnessQualityLoopLastRunV1 = {
  schemaId: HARNESS_QUALITY_LOOP_RUN_SCHEMA,
  version: 1,
  started_at: startedAt,
  finished_at: finishedAt,
  l1_smoke: {
    passed: l1.ok,
    path_fingerprint: l1Meta.pathFingerprint,
    baseline_match: l1Meta.baselineMatch,
    errors: l1.ok ? [] : [l1.output.slice(-800)],
  },
  decision_closure: {
    passed: dc.ok,
    jest_pattern: DECISION_CLOSURE_PATTERN,
    message: dc.ok ? undefined : dc.output.slice(-800),
  },
  overall_passed: l1.ok && dc.ok,
};

const reportPath = defaultQualityLoopReportPath();
saveQualityLoopLastRun(reportPath, report);

console.log(
  JSON.stringify({
    ok: report.overall_passed,
    report_path: reportPath,
    l1_passed: report.l1_smoke.passed,
    decision_closure_passed: report.decision_closure.passed,
  }),
);

process.exit(report.overall_passed ? 0 : 1);
