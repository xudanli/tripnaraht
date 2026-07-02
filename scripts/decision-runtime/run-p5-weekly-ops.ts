/**
 * Weekly ops bundle during P4 observation / P5 prep.
 *
 * Usage:
 *   npm run p5-weekly-ops
 */

import 'dotenv/config';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-weekly-ops');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-weekly-ops] ${line}`);
}

function run(cmd: string): { ok: boolean; output: string } {
  try {
    const output = execSync(cmd, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, output };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      output: [e.stdout, e.stderr, e.message].filter(Boolean).join('\n'),
    };
  }
}

function readJson<T>(rel: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')) as T;
  } catch {
    return null;
  }
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const steps = [
    { id: 'trigger-wiring', cmd: 'npm run trigger-wiring:status' },
    { id: 'p4-observation', cmd: 'npm run p4-observation:status' },
    { id: 'production-observation', cmd: 'npm run production-observation:collect' },
    { id: 'production-flip-advisory', cmd: 'npm run p4-production-flip:advisory' },
    { id: 'trigger-bypass-priority', cmd: 'npm run trigger-bypass-priority' },
    { id: 'p5-architecture-lint', cmd: 'npm run p5-architecture:lint' },
    { id: 'p5-agentic-staging', cmd: 'npm run p5-agentic-providers:staging' },
    { id: 'constraint-rollout', cmd: 'npm run constraint-rollout:status' },
    { id: 'constraint-default-on', cmd: 'npm run p5-constraint-default-on:status' },
    { id: 'p5-phase-status', cmd: 'npm run p5-phase:status' },
  ];

  const results = steps.map((step) => {
    const softFail = step.id === 'production-flip-advisory';
    const result = run(step.cmd);
    return {
      ...step,
      pass: result.ok || softFail,
      detail: result.ok ? 'ok' : softFail ? 'advisory recorded (gates may be blocked)' : result.output.slice(-400),
    };
  });

  const observation = readJson<{ pass?: boolean; detail?: string }>(
    'artifacts/p4-observation-status/status.json',
  );
  const productionObservation = readJson<{ overallDisposition?: string }>(
    'artifacts/production-observation/report.json',
  );
  const triggerWiring = readJson<{ pass?: boolean; engineeringComplete?: boolean }>(
    'artifacts/trigger-wiring-status/closure.json',
  );
  const pass = results.every((r) => r.pass);

  const report = {
    schemaId: 'tripnara.p5_weekly_ops@v1',
    generatedAt: new Date().toISOString(),
    pass,
    observationWindow: observation?.detail ?? 'unknown',
    productionObservationDisposition: productionObservation?.overallDisposition ?? 'unknown',
    triggerWiringComplete: triggerWiring?.engineeringComplete ?? false,
    steps: results,
    blockers: results.filter((r) => !r.pass).map((r) => r.id),
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} steps=${results.filter((r) => r.pass).length}/${results.length}`);
  log(`observation: ${observation?.detail ?? 'n/a'}`);

  if (!pass) process.exitCode = 1;
}

main();
