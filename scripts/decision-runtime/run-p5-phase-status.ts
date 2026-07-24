/**
 * Phase 5 status — LEGACY_DEPRECATED readiness.
 *
 * Usage:
 *   npm run p5-phase:status
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { evaluateLegacyDeprecatedReadiness } from '../../src/decision-runtime/p5-phase/legacy-deprecated-readiness.evaluator';
import { evaluateLegacyConvergence } from '../../src/decision-runtime/p4-phase/legacy-convergence.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-phase-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-status] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const p4Final = readJson<{ overall?: string; engineeringComplete?: boolean }>(
    'artifacts/p4-phase-status/final-closure.json',
  );
  const archLint = readJson<{ pass?: boolean }>(
    'artifacts/p5-architecture-lint/report.json',
  );
  const agenticStaging = readJson<{ pass?: boolean }>(
    'artifacts/p5-agentic-providers-staging/report.json',
  );
  const caps = resolveDecisionRuntimeCapabilities();
  const convergence = evaluateLegacyConvergence(caps);
  const deprecatedReadiness = evaluateLegacyDeprecatedReadiness(caps);

  const report = {
    schemaId: 'tripnara.p5_phase_status@v1',
    generatedAt: new Date().toISOString(),
    phase: 'P5',
    p4FinalClosure: p4Final?.overall ?? 'UNKNOWN',
    p4EngineeringComplete: p4Final?.engineeringComplete ?? false,
    architectureLintPass: archLint?.pass ?? false,
    agenticProvidersStagingPass: agenticStaging?.pass ?? false,
    convergence,
    legacyDeprecatedReadiness: deprecatedReadiness,
    blockers: deprecatedReadiness.blockers,
    nextSteps: [
      'Complete production CANONICAL_DEFAULT flip',
      'Promote constraints DEFAULT_ON → LEGACY_DEPRECATED in catalog',
      'npm run p5-architecture:lint',
      'npm run p5-agentic-providers:staging',
      'npm run p4-observation:status (weekly during observation)',
    ],
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `stage=${convergence.currentStage} deprecatedReady=${deprecatedReadiness.ready} blockers=${deprecatedReadiness.blockers.length}`,
  );

  if (!p4Final?.engineeringComplete) {
    log('hint: run npm run p4-phase:final-closure after p4-flip-full-drill');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
