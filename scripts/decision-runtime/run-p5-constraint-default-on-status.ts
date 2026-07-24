/**
 * Constraint DEFAULT_ON promotion status.
 *
 * Usage:
 *   npm run p5-constraint-default-on:status
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { evaluateConstraintDefaultOnPromotion } from '../../src/decision-runtime/p5-phase/constraint-default-on-promotion.evaluator';
import { buildCanonicalDefaultPreviewCapabilities } from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-constraint-default-on-status');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-default-on-status] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const caps = resolveDecisionRuntimeCapabilities();
  const currentEvaluation = evaluateConstraintDefaultOnPromotion(caps);
  const previewEvaluation = evaluateConstraintDefaultOnPromotion(
    buildCanonicalDefaultPreviewCapabilities(caps),
  );
  const readyCount = previewEvaluation.scenarios.filter((s) => s.readyForDefaultOn).length;

  const report = {
    schemaId: 'tripnara.p5_constraint_default_on_status@v1',
    generatedAt: new Date().toISOString(),
    currentEnvEvaluation: currentEvaluation,
    previewCapsEvaluation: previewEvaluation,
    readyForDefaultOnCount: readyCount,
    totalScenarios: previewEvaluation.scenarios.length,
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `current ready=${currentEvaluation.ready} preview ready=${previewEvaluation.ready} scenarios=${readyCount}/${previewEvaluation.scenarios.length}`,
  );

  if (!previewEvaluation.ready) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
