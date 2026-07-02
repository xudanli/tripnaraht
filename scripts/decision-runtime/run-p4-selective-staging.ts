/**
 * P4 selective staging — HTTP probes for CANONICAL_SELECTIVE posture on :3000.
 *
 * Usage:
 *   npm run p4-selective:staging
 *   npm run p4-selective:staging -- http://localhost:3000/api
 *
 * Server env (recommended):
 *   DECISION_RUNTIME_MODE=SHADOW
 *   CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED
 *   CONSTRAINT_GATEWAY_ON_SCENARIOS=iceland-road-closed,weather-outdoor-storm,daily-load-excessive,in-trip-replan
 *   DECISION_TRIGGER_GATEWAY_ENABLED=1
 *   REPLANNING_TRIGGER_POLICY_ENABLED=1
 *   BOUNDED_LNS_REPAIR_ENABLED=1
 *   AUTHORIZATION_POLICY_GATEWAY_ENABLED=1
 *   DECISION_PACK_RULES=1
 *
 * Note: restart backend after pulling P3/P4 code (trigger-center route + provider registry).
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BASE = (
  process.env.P4_SELECTIVE_BASE_URL ?? 'http://localhost:3000/api'
).replace(/\/$/, '');
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-selective-staging');

type ApiResponse<T> = { success: boolean; data?: T };

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-selective] ${line}`);
}

async function apiGet<T>(base: string, apiPath: string): Promise<T> {
  const res = await fetch(`${base}${apiPath}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${apiPath}`);
  }
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success || !json.data) {
    throw new Error(`API ${apiPath} unsuccessful`);
  }
  return json.data;
}

async function main() {
  const base = (process.argv[2] ?? DEFAULT_BASE).replace(/\/$/, '');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const probes: Array<{ id: string; pass: boolean; detail: string }> = [];

  type Caps = {
    schemaId?: string;
    mode?: string;
    constraintGatewayOnForSelected?: boolean;
    replanningTriggerPolicy?: boolean;
    decisionTriggerGateway?: boolean;
    authorizationPolicyGateway?: boolean;
    legacyConvergence?: { currentStage?: string };
    providerRegistry?: { providers?: Array<{ runtimeBound?: boolean; status?: string }> };
  };

  let caps: Caps | null = null;
  try {
    caps = await apiGet<Caps>(base, '/decision-engine/v1/runtime-capabilities');
    const stage =
      caps.legacyConvergence?.currentStage ??
      (caps.constraintGatewayOnForSelected && caps.decisionTriggerGateway
        ? 'CANONICAL_SELECTIVE (inferred)'
        : caps.mode ?? 'unknown');
    probes.push({
      id: 'runtime-capabilities',
      pass: caps.schemaId === 'tripnara.decision_runtime_capabilities@v1',
      detail: stage,
    });
    probes.push({
      id: 'constraint-on-for-selected',
      pass: caps.constraintGatewayOnForSelected === true,
      detail: String(caps.constraintGatewayOnForSelected),
    });
    probes.push({
      id: 'trigger-gateway',
      pass: caps.decisionTriggerGateway === true,
      detail: String(caps.decisionTriggerGateway),
    });
    probes.push({
      id: 'replanning-policy',
      pass: caps.replanningTriggerPolicy === true,
      detail: String(caps.replanningTriggerPolicy),
    });
    probes.push({
      id: 'authorization-gateway',
      pass: caps.authorizationPolicyGateway === true,
      detail: String(caps.authorizationPolicyGateway),
    });
    const boundActive =
      caps.providerRegistry?.providers?.filter((p) => p.runtimeBound && p.status === 'ACTIVE')
        .length ?? 0;
    probes.push({
      id: 'provider-registry-bound',
      pass: boundActive >= 5,
      detail: `${boundActive} bound (need ≥5 after server restart)`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    probes.push({ id: 'runtime-capabilities', pass: false, detail: message });
  }

  try {
    const triggerCenter = await apiGet<{ schemaId?: string }>(
      base,
      '/decision-engine/v1/trigger-center/by-trip/p4-selective-probe',
    );
    probes.push({
      id: 'trigger-center-m7',
      pass: triggerCenter.schemaId === 'tripnara.trigger_center_view@v1',
      detail: triggerCenter.schemaId ?? 'ok',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    probes.push({
      id: 'trigger-center-m7',
      pass: false,
      detail: `${message} — restart backend with latest P3 code`,
    });
  }

  const pass = probes.every((p) => p.pass);
  const report = {
    schemaId: 'tripnara.p4_selective_staging@v1',
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    pass,
    probes,
    blockers: probes.filter((p) => !p.pass).map((p) => p.id),
    serverHints: pass
      ? []
      : [
          'Set full selective env on :3000 and restart nest',
          'REPLANNING_TRIGGER_POLICY_ENABLED=1 AUTHORIZATION_POLICY_GATEWAY_ENABLED=1',
          'Rebuild: npm run backend:build && npm run backend:start',
        ],
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`pass=${pass} probes=${probes.filter((p) => p.pass).length}/${probes.length}`);

  if (!pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
