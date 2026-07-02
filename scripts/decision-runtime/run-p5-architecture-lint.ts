/**
 * P5 architecture lint — write artifact for readiness gates.
 *
 * Usage:
 *   npm run p5-architecture:lint
 */

import * as fs from 'fs';
import * as path from 'path';
import { runDecisionRuntimeArchitectureLint } from '../../src/decision-runtime/architecture/decision-runtime-architecture-lint.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-architecture-lint');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-arch-lint] ${line}`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = runDecisionRuntimeArchitectureLint();
  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `pass=${report.pass} legacyBoolean=${report.legacyBooleanCallerCount} executorBypass=${report.executorBypassCount}`,
  );
  if (!report.pass) {
    log(`blockers: ${report.blockers.join(', ')}`);
    process.exitCode = 1;
  }
}

main();
