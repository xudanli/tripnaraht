/**
 * P5 agentic provider HTTP staging probes.
 *
 * Usage:
 *   npm run p5-agentic-providers:staging
 *   npm run p5-agentic-providers:staging -- http://localhost:3000/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_BASE = (
  process.env.P5_AGENTIC_PROVIDERS_BASE_URL ?? 'http://localhost:3000/api'
).replace(/\/$/, '');
const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p5-agentic-providers-staging');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p5-agentic] ${line}`);
}

async function post<T>(base: string, apiPath: string, body: unknown) {
  const res = await fetch(`${base}${apiPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const json = (await res.json()) as { success: boolean; data?: T };
  return { status: res.status, json };
}

async function main() {
  const base = (process.argv[2] ?? DEFAULT_BASE).replace(/\/$/, '');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const probes: Array<{ id: string; pass: boolean; detail: string }> = [];
  const tripId = 'p5-agentic-staging-probe';
  const emptyPlan = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    days: [{ day: 1, date: '2026-06-10', timeSlots: [] }],
  };

  const research = await post<{ schemaId?: string; providerId?: string }>(
    base,
    '/decision-engine/v1/providers/research',
    { tripId, query: 'staging probe' },
  );
  probes.push({
    id: 'research-provider',
    pass:
      research.status < 400 &&
      research.json.success &&
      research.json.data?.schemaId === 'tripnara.research_provider_result@v1',
    detail: research.json.data?.schemaId ?? String(research.status),
  });

  const narration = await post<{ schemaId?: string }>(
    base,
    '/decision-engine/v1/providers/narration',
    { tripId, plan: emptyPlan },
  );
  probes.push({
    id: 'narration-provider',
    pass:
      narration.status < 400 &&
      narration.json.success &&
      narration.json.data?.schemaId === 'tripnara.narration_provider_result@v1',
    detail: narration.json.data?.schemaId ?? String(narration.status),
  });

  const critic = await post<{ schemaId?: string; signals?: unknown[] }>(
    base,
    '/decision-engine/v1/providers/critic',
    { tripId, plan: emptyPlan },
  );
  probes.push({
    id: 'critic-provider',
    pass:
      critic.status < 400 &&
      critic.json.success &&
      critic.json.data?.schemaId === 'tripnara.critic_provider_result@v1',
    detail: critic.json.data?.schemaId ?? String(critic.status),
  });

  const capsRes = await fetch(`${base}/decision-engine/v1/runtime-capabilities`, {
    signal: AbortSignal.timeout(8000),
  });
  const capsJson = (await capsRes.json()) as {
    success: boolean;
    data?: { providerRegistry?: { providers?: Array<{ runtimeBound?: boolean }> } };
  };
  const bound =
    capsJson.data?.providerRegistry?.providers?.filter((p) => p.runtimeBound).length ?? 0;
  probes.push({
    id: 'provider-registry-bound',
    pass: bound >= 5,
    detail: `${bound} runtime-bound`,
  });

  const pass = probes.every((p) => p.pass);
  const report = {
    schemaId: 'tripnara.p5_agentic_providers_staging@v1',
    generatedAt: new Date().toISOString(),
    baseUrl: base,
    pass,
    probes,
    blockers: probes.filter((p) => !p.pass).map((p) => p.id),
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
