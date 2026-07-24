#!/usr/bin/env npx ts-node
/**
 * 导出 route_and_run Golden Eval（产品路由协议层）。
 *
 * Usage:
 *   npx ts-node scripts/export-route-and-run-golden-eval.ts
 *   ROUTE_AND_RUN_GOLDEN_EVAL_OUT=artifacts/route-and-run-golden-eval.json
 */
import fs from 'fs';
import path from 'path';
import { runRouteAndRunRoutingGate } from './ci/route-and-run-routing-gate.lib';
import { ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES } from '../src/agent/routing/route-and-run-golden-eval-fixtures';

function main(): void {
  const outPath =
    process.env.ROUTE_AND_RUN_GOLDEN_EVAL_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'route-and-run-golden-eval.json');

  const gate = runRouteAndRunRoutingGate();
  const rows = ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.map((fx) => {
    const golden = gate.golden.rows.find((r) => r.id === fx.id)!;
    return {
      id: fx.id,
      label: fx.label,
      message: fx.request.message,
      trip_id: fx.request.trip_id ?? null,
      expected: fx.expected,
      actual: {
        routeClass: golden.actualRouteClass,
        deepResearchV71: golden.deepResearchV71,
      },
      pass: golden.pass,
    };
  });

  const doc = {
    schemaId: 'tripnara.route_and_run_golden_eval_export@v1',
    version: 1,
    generated_at: gate.generated_at,
    fixture_count: rows.length,
    pass_count: gate.golden.pass_count,
    fail_count: gate.golden.fail_count,
    rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${rows.length} golden rows (${gate.golden.pass_count} pass) → ${outPath}`);
  if (gate.golden.fail_count > 0) {
    process.exitCode = 1;
  }
}

main();
