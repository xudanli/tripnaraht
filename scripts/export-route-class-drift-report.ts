#!/usr/bin/env npx ts-node
/**
 * 协议 route class vs 生产 proxy drift 报告（Golden + fork-aware）。
 *
 * Usage:
 *   npx ts-node scripts/export-route-class-drift-report.ts
 *   ROUTE_CLASS_DRIFT_OUT=artifacts/route-class-drift-report.json
 */
import fs from 'fs';
import path from 'path';
import { runRouteAndRunRoutingGate } from './ci/route-and-run-routing-gate.lib';

function main(): void {
  process.env.ROUTE_CLASS_FORK = process.env.ROUTE_CLASS_FORK ?? '1';

  const outPath =
    process.env.ROUTE_CLASS_DRIFT_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'route-class-drift-report.json');

  const gate = runRouteAndRunRoutingGate();
  const rows = gate.drift.rows.map((r) => ({
    id: r.id,
    label: r.label,
    golden_route_class: gate.golden.rows.find((g) => g.id === r.id)?.expectedRouteClass,
    protocol_route_class: r.protocolRouteClass,
    production_route_class: r.productionRouteClass,
    mismatchType: r.isMatch ? 'NONE' : r.mismatchType,
    isMatch: r.isMatch,
    golden_aligns_protocol: r.goldenAlignsProtocol,
  }));

  const doc = {
    schemaId: 'tripnara.route_class_drift_report@v1',
    version: 1,
    generated_at: gate.generated_at,
    fixture_count: gate.fixture_count,
    protocol_golden_pass: gate.drift.protocol_golden_pass,
    protocol_vs_production: gate.drift.confusion,
    rows,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(doc, null, 2));
  console.log(
    `Wrote drift report (${gate.drift.match_count} match / ${gate.drift.drift_count} drift) → ${outPath}`,
  );
  console.log(JSON.stringify(gate.drift.confusion));

  if (gate.drift.drift_count > 0 || gate.drift.protocol_golden_pass !== gate.fixture_count) {
    process.exitCode = 1;
  }
}

main();
