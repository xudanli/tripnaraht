#!/usr/bin/env npx ts-node
/**
 * P0-4：从 fixture + E2E 代表性用例批量导出 RoutingClassifierEval 语料，并统计 shadow mismatch。
 *
 * Usage:
 *   npx ts-node scripts/export-routing-classifier-eval-corpus.ts
 *   ROUTING_EVAL_EXPORT_OUT=artifacts/routing-classifier-eval-export.json
 *
 * ground_truth overlay（默认 SSOT）：
 *   src/agent/routing/routing-ground-truth-overlay.json
 */
import fs from 'fs';
import path from 'path';
import { buildRoutingClassifierEvalExport } from '../src/agent/routing/routing-classifier-eval-export.util';

function main(): void {
  const outPath =
    process.env.ROUTING_EVAL_EXPORT_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'routing-classifier-eval-export.json');

  const exportDoc = buildRoutingClassifierEvalExport();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(exportDoc, null, 2)}\n`);
  process.stderr.write(
    `[export-routing-classifier-eval-corpus] ${exportDoc.fixture_count} samples → ${outPath}\n` +
      `  shadow v0: match=${exportDoc.shadow_confusion_v0.match} over=${exportDoc.shadow_confusion_v0.OVER_ROUTING} under=${exportDoc.shadow_confusion_v0.UNDER_ROUTING}\n` +
      `  labeled v1: match=${exportDoc.labeled_vs_shadow_v1.match}/${exportDoc.fixture_count} overlay=${exportDoc.overlay_applied_count}\n` +
      `  production vs labeled over=${exportDoc.production_vs_labeled_v1.OVER_ROUTING}\n`,
  );

  if (!exportDoc.ok) {
    process.stderr.write(
      `[export-routing-classifier-eval-corpus] FAIL unresolved=${exportDoc.samples.length - exportDoc.labeled_vs_shadow_v1.match}\n`,
    );
    process.exitCode = 1;
  }
}

main();
