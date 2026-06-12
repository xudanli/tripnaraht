#!/usr/bin/env npx ts-node
/**
 * Build RoutingClassifierEval@v1 corpus from deterministic rule fixtures (no HTTP).
 */
import fs from 'fs';
import path from 'path';
import { buildRoutingClassifierEvalExport } from '../src/agent/routing/routing-classifier-eval-export.util';

function main(): void {
  const outPath =
    process.env.ROUTING_EVAL_CORPUS_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'routing-classifier-eval-corpus.json');

  const exportDoc = buildRoutingClassifierEvalExport();

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(
    outPath,
    `${JSON.stringify({ schemaId: 'tripnara.routing_classifier_eval_corpus@v1', version: 1, samples: exportDoc.samples }, null, 2)}\n`,
  );
  process.stderr.write(`[build-routing-classifier-eval-corpus] wrote ${exportDoc.samples.length} samples → ${outPath}\n`);
}

main();
