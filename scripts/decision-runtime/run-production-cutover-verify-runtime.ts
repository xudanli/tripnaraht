/**
 * Post-restart live runtime verification — parsed capabilities must match cutover target.
 *
 * Usage (after applying production-cutover.env + restart):
 *   DECISION_RUNTIME_BASE_URL=http://localhost:3000/api npm run production-cutover:verify-runtime
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { verifyCutoverRuntimePosture } from '../../src/decision-runtime/production-transition/production-cutover-runtime-verify.util';
import type { CutoverRuntimeCapsInput } from '../../src/decision-runtime/production-transition/production-cutover-runtime-verify.util';
import { anchorProbationBaseline } from '../../src/decision-runtime/production-transition/production-cutover-probation-anchor.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-cutover');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [cutover-verify-runtime] ${line}`);
}

function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const apiBase = resolveApiBase(
    process.env.DECISION_RUNTIME_BASE_URL?.trim() || 'http://localhost:3000/api',
  );

  const res = await fetch(`${apiBase}/decision-engine/v1/runtime-capabilities`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    log(`FAIL: HTTP ${res.status}`);
    process.exit(1);
  }

  const json = (await res.json()) as { data?: CutoverRuntimeCapsInput & Record<string, unknown> };
  const data = json.data;
  if (!data) {
    log('FAIL: empty runtime-capabilities data');
    process.exit(1);
  }

  const verify = verifyCutoverRuntimePosture({
    mode: data.mode as string | undefined,
    optimizationStrategyMode: data.optimizationStrategyMode as string | undefined,
    constraintGatewayMode: data.constraintGatewayMode as string | undefined,
    decisionTriggerGateway: data.decisionTriggerGateway as boolean | undefined,
    authorizationPolicyGateway: data.authorizationPolicyGateway as boolean | undefined,
    replanningTriggerPolicy: data.replanningTriggerPolicy as boolean | undefined,
    effectivePlanWriteGuard: data.effectivePlanWriteGuard as boolean | undefined,
    productionTransition: data.productionTransition as CutoverRuntimeCapsInput['productionTransition'],
  });

  const report = {
    ...verify,
    generatedAt: new Date().toISOString(),
    apiBase,
    rawSnapshot: {
      mode: data.mode,
      optimizationStrategyMode: data.optimizationStrategyMode,
      constraintGatewayMode: data.constraintGatewayMode,
      productionTransition: data.productionTransition,
    },
  };

  const outPath = path.join(OUT_DIR, 'runtime-verify.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  for (const check of verify.checks) {
    log(`${check.pass ? '✓' : '✗'} ${check.id}: expected=${check.expected} actual=${check.actual}`);
  }

  log(`written ${outPath}`);
  log(`pass=${verify.pass}`);

  if (verify.pass) {
    const smoke = (() => {
      try {
        return JSON.parse(
          fs.readFileSync(path.join(OUT_DIR, 'smoke.json'), 'utf8'),
        ) as { pass?: boolean };
      } catch {
        return null;
      }
    })();
    const baseline = anchorProbationBaseline({
      verifyRuntimePass: true,
      smokePass: smoke?.pass === true,
    });
    if (baseline) {
      log(`probation anchor recorded probationStartedAt=${baseline.probationStartedAt}`);
    } else if (!smoke?.pass) {
      log('smoke not pass yet — probation anchor deferred until smoke PASS');
    }
  }

  if (!verify.pass) {
    log(`blockers: ${verify.blockers.join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
