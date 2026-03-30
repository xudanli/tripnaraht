#!/usr/bin/env node
/**
 * Writes MODULE_STATUS_BOARD v2 gate reports under artifacts/.
 * Invoked by scripts/release-gate-v2.sh after checks (M1, readiness, optional C1 log).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const ART = join(ROOT, 'artifacts');

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function gitSha(root) {
  try {
    return execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

const ts = nowIso();
const git = gitSha(ROOT);

mkdirSync(ART, { recursive: true });

const m1Exit = Number(process.env.M1_EXIT ?? '1');
const m1Verdict = m1Exit === 0 ? 'PASS' : 'BLOCK';

const m1Report = {
  schema: 'm1-close/v1',
  gateId: 'M1_CLOSE',
  boardId: 'MODULE_STATUS_BOARD_V2',
  timestamp: ts,
  repo: { gitSha: git },
  verdict: m1Verdict,
  inputs: {
    test_ao_gate_p0: { exitCode: m1Exit },
  },
  checks: {
    A1_verdict: m1Verdict === 'PASS' ? 'implemented_and_tested' : 'not_run_or_failed',
    A2_G01: 'see_test_ao_gate_p0',
    A3_K3: 'see_test_ao_gate_p0',
  },
};

writeFileSync(join(ART, 'm1_close_report.json'), JSON.stringify(m1Report, null, 2) + '\n', 'utf8');

const readinessPath = process.env.READINESS_REPORT_PATH || join(ART, 'readiness_report.json');
let c3Verdict = 'BLOCK';
let readinessPayload = null;
if (existsSync(readinessPath)) {
  try {
    readinessPayload = JSON.parse(readFileSync(readinessPath, 'utf8'));
    if (readinessPayload.ok === true) c3Verdict = 'PASS';
  } catch {
    c3Verdict = 'BLOCK';
  }
}

const c3Report = {
  schema: 'c3-readiness/v1',
  gateId: 'C3_READINESS_GREEN',
  boardId: 'MODULE_STATUS_BOARD_V2',
  timestamp: ts,
  repo: { gitSha: git },
  verdict: c3Verdict,
  inputs: {
    readiness_p1_report: readinessPath,
    readiness_ok: readinessPayload?.ok ?? null,
  },
  checks: {
    artifact_generated: existsSync(readinessPath),
    ao_06: 'manual_verify_in_board',
    ao_05_checklist: 'manual_verify_in_board',
  },
};

writeFileSync(join(ART, 'c3_readiness_report.json'), JSON.stringify(c3Report, null, 2) + '\n', 'utf8');

const e2ePath = process.env.C1_E2E_LOG_PATH || join(ART, 'e2e_run_log.json');
let c1Verdict = 'BLOCK';
let e2ePayload = null;
let c1StrictSoftRejected = false;

function c1ArtifactPasses(payload) {
  if (!payload || typeof payload !== 'object') return false;
  // Legacy schema (manual / example)
  if (
    payload.ok === true &&
    Number(payload.route_and_run_success ?? 0) >= 1 &&
    payload.reproducible === true
  ) {
    return true;
  }
  // C1 CLI schema (tripnara route_and_run --write-artifact)
  if (
    payload.route_status === 'SUCCESS' &&
    payload.run_status === 'SUCCESS' &&
    typeof payload.case_id === 'string' &&
    typeof payload.env === 'string' &&
    typeof payload.cli_harness_case_id === 'string' &&
    typeof payload.timestamp === 'string'
  ) {
    return true;
  }
  return false;
}

if (existsSync(e2ePath)) {
  try {
    e2ePayload = JSON.parse(readFileSync(e2ePath, 'utf8'));
    if (c1ArtifactPasses(e2ePayload)) {
      c1Verdict = 'PASS';
      // 准生产签字：拒绝「仅 soft 澄清通过」的 artifact（需 result.status OK 路径时请用 CLI 不加 --soft）
      if (
        process.env.RELEASE_GATE_C1_STRICT === '1' &&
        e2ePayload.c1_soft_pass === true
      ) {
        c1Verdict = 'BLOCK';
        c1StrictSoftRejected = true;
      }
    }
  } catch {
    c1Verdict = 'BLOCK';
  }
}

const c1Summary = {
  schema: 'c1-e2e/v1',
  gateId: 'C1_E2E_READY',
  boardId: 'MODULE_STATUS_BOARD_V2',
  timestamp: ts,
  repo: { gitSha: git },
  verdict: c1Verdict,
  sourceFile: existsSync(e2ePath) ? e2ePath : null,
  details: e2ePayload,
  blockReason:
    c1Verdict === 'PASS'
      ? null
      : !existsSync(e2ePath)
        ? 'missing_artifact: add artifacts/e2e_run_log.json after quasi-prod run (see docs/testing/C1_QUASI_PROD_E2E.md)'
        : c1StrictSoftRejected
          ? 'RELEASE_GATE_C1_STRICT: c1_soft_pass not allowed for production sign-off'
          : 'e2e_log_present_but_checks_failed',
};

writeFileSync(join(ART, 'c1_e2e_summary.json'), JSON.stringify(c1Summary, null, 2) + '\n', 'utf8');

const releaseAllowed = m1Verdict === 'PASS' && c1Verdict === 'PASS' && c3Verdict === 'PASS';
const releaseVerdict = releaseAllowed ? 'RELEASE_ALLOWED' : 'RELEASE_BLOCKED';

const releaseGate = {
  schema: 'release-gate/v1',
  boardId: 'MODULE_STATUS_BOARD_V2',
  timestamp: ts,
  repo: { gitSha: git },
  verdict: releaseVerdict,
  gates: {
    M1_CLOSE: m1Verdict,
    C1_E2E_READY: c1Verdict,
    C3_READINESS_GREEN: c3Verdict,
  },
  artifacts: {
    m1_close_report: 'artifacts/m1_close_report.json',
    c1_e2e_summary: 'artifacts/c1_e2e_summary.json',
    readiness_report: 'artifacts/readiness_report.json',
    e2e_run_log: existsSync(e2ePath) ? 'artifacts/e2e_run_log.json' : null,
  },
};

writeFileSync(join(ART, 'release_gate_report.json'), JSON.stringify(releaseGate, null, 2) + '\n', 'utf8');

if (!releaseAllowed) {
  const lines = [
    '[release-gate:v2] RELEASE_BLOCKED — gate summary:',
    `  M1_CLOSE:            ${m1Verdict}`,
    `  C3_READINESS_GREEN:  ${c3Verdict}`,
    `  C1_E2E_READY:        ${c1Verdict}`,
  ];
  if (c1Summary.blockReason) {
    lines.push(`  C1 detail:           ${c1Summary.blockReason}`);
  }
  lines.push('  See: artifacts/release_gate_report.json, artifacts/c1_e2e_summary.json');
  process.stderr.write(lines.join('\n') + '\n');
}

process.stdout.write(`${releaseVerdict}\n`);
process.exit(releaseAllowed ? 0 : 1);
