/**
 * Constraint rollout promotion status.
 *
 * Usage:
 *   npm run constraint-rollout:status
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';
import { evaluateConstraintRolloutPromotion } from '../../src/decision-runtime/p4-phase/constraint-rollout-promotion.evaluator';
import { evaluateCanonicalDefaultPromotion } from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'constraint-rollout-status');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [constraint-rollout] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const catalog = snapshotConstraintOnRolloutCatalog();
  const promotion = evaluateConstraintRolloutPromotion();
  const caps = resolveDecisionRuntimeCapabilities();
  const canonicalDefault = evaluateCanonicalDefaultPromotion(caps);

  const readyToPromote = promotion.scenarios.filter((s) => s.readyForOn && s.currentPhase !== 'ON_FOR_SELECTED');

  const report = {
    schemaId: 'tripnara.constraint_rollout_status@v1',
    generatedAt: new Date().toISOString(),
    catalog,
    promotion,
    readyToPromote: readyToPromote.map((s) => s.scenarioId),
    canonicalDefaultPromotion: canonicalDefault,
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `ON_FOR_SELECTED=${catalog.onForSelectedCount}/${catalog.entryCount} readyToPromote=${readyToPromote.length}`,
  );
  log(`CANONICAL_DEFAULT ready=${canonicalDefault.ready} blockers=${canonicalDefault.blockers.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
