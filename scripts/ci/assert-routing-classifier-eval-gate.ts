#!/usr/bin/env npx tsx
/**
 * CI gate: P0-4 RoutingClassifierEval — labeled ground_truth vs shadow 全匹配。
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildRoutingClassifierEvalExport } from '../../src/agent/routing/routing-classifier-eval-export.util';

function main(): void {
  const exportDoc = buildRoutingClassifierEvalExport();
  const outPath =
    process.env.ROUTING_EVAL_EXPORT_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'routing-classifier-eval-export.json');

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(exportDoc, null, 2)}\n`);

  console.log(
    `[ci:routing-classifier-eval] labeled ${exportDoc.labeled_vs_shadow_v1.match}/${exportDoc.fixture_count} · overlay=${exportDoc.overlay_applied_count} · shadow over=${exportDoc.shadow_confusion_v0.OVER_ROUTING}`,
  );
  console.log(`[ci:routing-classifier-eval] report → ${outPath}`);

  if (!exportDoc.ok) {
    console.error(
      `[ci:routing-classifier-eval] FAIL — check ground_truth overlay vs shadow challenger`,
    );
    process.exit(1);
  }
}

main();
