/**
 * Eval script: Iron Shield Narrator backtest
 *
 * This script is designed to run in environments WITHOUT Docker/Python training stacks.
 * It produces a regression-test-style JSON artifact that you can compare across model versions.
 *
 * Modes:
 * 1) local (default): execute NarrateExecutorService in-process, comparing:
 *    - baseline: narrator only
 *    - iron_shield: narrator + ConstraintsEngineService injection
 *
 * 2) http: call a running NestJS service (route_and_run) to produce end-to-end output.
 *    Note: route_and_run may not allow direct injection of EnvironmentState; treat this as a smoke test.
 *
 * Usage:
 *   npx tsx scripts/eval-iron-shield-narrator.ts
 *
 *   # local output path override
 *   OUT=artifacts/eval/iron_shield_eval.json npx tsx scripts/eval-iron-shield-narrator.ts
 *
 *   # http mode
 *   MODE=http NEST_URL=http://localhost:3000 npx tsx scripts/eval-iron-shield-narrator.ts
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ConstraintRuleManagerService } from '../src/agent/training/services/constraint-rule-manager.service';
import { ConstraintsEngineService } from '../src/agent/training/services/constraints-engine.service';
import { NarrateExecutorService } from '../src/agent/execution/narrate-executor.service';

type AnyObj = Record<string, any>;

function nowIso() {
  return new Date().toISOString();
}

async function httpPostJson(url: string, payload: AnyObj): Promise<AnyObj> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}: ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function buildScenario(): { dso: AnyObj; orchestratorState: AnyObj } {
  const requestId = 'eval-iron-shield-001';
  const itinerary = {
    request_id: requestId,
    days: [
      {
        date: '2026-12-10',
        items: [
          {
            id: 'rt1_south',
            type: 'DRIVE',
            start_window: '15:30',
            end_window: '22:30',
            location_ref: { name: '1号公路南部段（South Coast Route 1）', place_id: 'rt1_south' },
            metadata: { tags: ['drive'], segment_id: 'rt1_south' },
            evidence_refs: [],
            verified: false,
          },
          {
            id: 'aurora-spot-1',
            type: 'POI',
            start_window: '18:00',
            end_window: '19:00',
            location_ref: { name: 'Aurora hunting spot', place_id: 'aurora-spot-1' },
            metadata: { tags: ['aurora'] },
            evidence_refs: [],
            verified: false,
          },
        ],
      },
    ],
  };

  const dso = {
    environmentState: {
      countryCode: 'IS',
      daylightByDate: {
        '2026-12-10': { sunset: '16:30', civil_dusk: '17:10' },
      },
      windSpeedBySegment: {
        rt1_south: 25.0,
      },
      segmentNameBySegment: {
        rt1_south: '1号公路南部段（South Coast Route 1）',
      },
    },
    verification: { issues: [] },
  };

  const orchestratorState = {
    request_id: requestId,
    current_step: 'NARRATE',
    itinerary,
    trip_plan_request: {
      request_id: requestId,
      origin: 'Reykjavik',
      destination: 'Vik',
      party_profile: { risk_tolerance: 'low' },
    },
    gate_result: { gate_result: 'ALLOW', violations: [], required_adjustments: [], confidence: 1 },
    compliance_result: { risk_warnings: [], disclaimers: [], required_confirmations: [] },
    decision_log: [],
    evidence_registry: new Map(),
    errors: [],
    metadata: { started_at: nowIso(), last_updated_at: nowIso() },
  };

  return { dso, orchestratorState };
}

async function runLocal(): Promise<AnyObj> {
  const { dso, orchestratorState } = buildScenario();
  const ctx = { requestId: orchestratorState.request_id, orchestratorState } as AnyObj;

  const narrator = {
    narrate: async () => ({
      user_friendly_summary: '',
      day_by_day_narrative: [],
      highlights: [],
      tips: [],
      warnings: [],
    }),
  };

  const dummyConfig: any = { get: (_k: string) => undefined };
  const ruleManager = new ConstraintRuleManagerService(dummyConfig);
  const constraintsEngine = new ConstraintsEngineService({} as any, ruleManager);

  const baselineExec = new NarrateExecutorService(narrator as any, undefined);
  const ironExec = new NarrateExecutorService(narrator as any, constraintsEngine as any);

  const baseline = await baselineExec.execute(dso, ctx);
  const iron = await ironExec.execute(dso, ctx);

  // Also capture structured constraints output for audit/CI assertions (Level 3 causality contract).
  const constraintsResult = await constraintsEngine.checkConstraints(orchestratorState.itinerary as any, {
    country_code: dso.environmentState.countryCode,
    risk_appetite: 'low',
    daylightByDate: dso.environmentState.daylightByDate,
    windSpeedBySegment: dso.environmentState.windSpeedBySegment,
    segmentNameBySegment: dso.environmentState.segmentNameBySegment,
    decision_log: orchestratorState.decision_log ?? [],
  } as any);

  return {
    mode: 'local',
    scenario: { dso, itinerary: orchestratorState.itinerary },
    baseline: { narration: baseline.narration },
    iron_shield: { narration: iron.narration, constraints: constraintsResult },
  };
}

async function runHttp(): Promise<AnyObj> {
  const nestUrl = process.env.NEST_URL ?? 'http://localhost:3000';
  const endpoint = `${nestUrl.replace(/\/$/, '')}/agent/route_and_run`;
  const req = {
    request_id: 'eval-iron-shield-http-001',
    user_id: 'eval-bot',
    message:
      '我要在冰岛南岸自驾，今天风很大（25m/s），并且想去追极光。请给我一个安全建议，回答必须带[安全贴士]并引用具体路段名与风速。',
    options: { max_seconds: 20, max_steps: 3 },
  };
  const out = await httpPostJson(endpoint, req);
  return { mode: 'http', request: req, response: out };
}

async function main() {
  const mode = (process.env.MODE ?? 'local').toLowerCase();
  const outPath = resolve(process.cwd(), process.env.OUT ?? 'artifacts/eval/iron_shield_eval_result.json');
  await mkdir(resolve(outPath, '..'), { recursive: true });
  const result = mode === 'http' ? await runHttp() : await runLocal();
  await writeFile(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  // eslint-disable-next-line no-console
  console.log(`Wrote: ${outPath}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

