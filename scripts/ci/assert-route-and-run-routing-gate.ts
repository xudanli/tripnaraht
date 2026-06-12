#!/usr/bin/env npx tsx
/**
 * CI gate: route_and_run 产品路由 Golden + fork-aware drift（28/28 硬门禁）。
 *
 * Usage:
 *   npm run ci:route-and-run-routing
 *   ROUTE_AND_RUN_ROUTING_GATE_OUT=artifacts/route-and-run-routing-gate.json
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { runRouteAndRunRoutingGate } from './route-and-run-routing-gate.lib';

const JEST_TARGETS = [
  'src/agent/routing/route-and-run-route-class.util.spec.ts',
  'src/agent/routing/route-and-run-route-class-projection.util.spec.ts',
  'src/agent/routing/route-and-run-route-class-fork.util.spec.ts',
  'src/agent/routing/mirror-route-and-run-observability.util.spec.ts',
  'src/agent/services/shadow-route-class-evaluator.service.spec.ts',
  'src/agent/utils/orchestration-signals.trip-consultation.spec.ts',
].join(' ');

function main(): void {
  process.env.ROUTE_CLASS_FORK = process.env.ROUTE_CLASS_FORK ?? '1';
  process.env.ROUTE_CLASS_SHADOW_EVAL = process.env.ROUTE_CLASS_SHADOW_EVAL ?? '1';

  let jestExit = 0;
  try {
    execSync(`npx jest ${JEST_TARGETS} --no-cache`, {
      stdio: 'inherit',
      cwd: process.cwd(),
    });
  } catch {
    jestExit = 1;
  }

  const gate = runRouteAndRunRoutingGate();
  const outPath =
    process.env.ROUTE_AND_RUN_ROUTING_GATE_OUT?.trim() ||
    path.join(process.cwd(), 'artifacts', 'route-and-run-routing-gate.json');

  const report = {
    ...gate,
    jest: { exitCode: jestExit, targets: JEST_TARGETS.split(/\s+/) },
    ok: gate.ok && jestExit === 0,
  };

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(
    `[route-and-run-routing-gate] golden ${gate.golden.pass_count}/${gate.fixture_count} · drift ${gate.drift.match_count}/${gate.fixture_count} · jest exit=${jestExit}`,
  );
  console.log(`[route-and-run-routing-gate] report → ${outPath}`);

  if (!report.ok) {
    const failedGolden = gate.golden.rows.filter((r) => !r.pass);
    const failedDrift = gate.drift.rows.filter((r) => !r.isMatch);
    if (failedGolden.length > 0) {
      console.error('[route-and-run-routing-gate] golden failures:', failedGolden.map((r) => r.id).join(', '));
    }
    if (failedDrift.length > 0) {
      console.error('[route-and-run-routing-gate] drift failures:', failedDrift.map((r) => r.id).join(', '));
    }
    process.exit(1);
  }
}

main();
