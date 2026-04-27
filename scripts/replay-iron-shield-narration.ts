/**
 * Replay script: Iron Shield narration diff
 *
 * Goal:
 * - Produce a "before vs after" narration diff using the same itinerary + environment context.
 * - Baseline: narrator output only (no physical hint injection).
 * - IronShield: include physical narration injection from ConstraintsEngineService (segment wind, aurora window, etc).
 *
 * Usage:
 *   npx tsx scripts/replay-iron-shield-narration.ts
 *
 * Optional:
 * - If you have an HTTP narrator service, set NARRATOR_HTTP_URL to use it for baseline text generation.
 */

import { ConstraintRuleManagerService } from '../src/agent/training/services/constraint-rule-manager.service';
import { ConstraintsEngineService } from '../src/agent/training/services/constraints-engine.service';
import { NarrateExecutorService } from '../src/agent/execution/narrate-executor.service';

type AnyObj = Record<string, any>;

function nowIso() {
  return new Date().toISOString();
}

async function httpNarrate(url: string, payload: AnyObj): Promise<AnyObj> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return (await res.json()) as AnyObj;
}

function buildScenario(): {
  dso: AnyObj;
  orchestratorState: AnyObj;
} {
  const requestId = 'replay-iron-shield-001';
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
      // segment-level wind map (m/s)
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

async function main() {
  const { dso, orchestratorState } = buildScenario();
  const ctx = { requestId: orchestratorState.request_id, orchestratorState } as AnyObj;

  // Baseline narrator agent:
  // - Default: simple template narrator (no external deps)
  // - Optional: HTTP narrator service
  const narratorHttpUrl = process.env.NARRATOR_HTTP_URL;
  const baselineNarratorAgent = {
    narrate: async () => {
      if (narratorHttpUrl) {
        // Expect the remote service to accept these fields (adapt as needed for your deployment).
        const out = await httpNarrate(narratorHttpUrl, {
          itinerary: orchestratorState.itinerary,
          gate_result: orchestratorState.gate_result,
          decision_log: orchestratorState.decision_log,
          context: orchestratorState,
        });
        return out;
      }
      return {
        user_friendly_summary: '',
        day_by_day_narrative: [],
        highlights: [],
        tips: [],
        warnings: [],
      };
    },
  };

  // Build constraints engine (RuleManager reads from src/assets/ontology/rules by default)
  const dummyConfig: any = { get: (_k: string) => undefined };
  const ruleManager = new ConstraintRuleManagerService(dummyConfig);
  const constraintsEngine = new ConstraintsEngineService({} as any, ruleManager);

  // 1) Baseline: no constraints engine injected → no physical hint injection.
  const baselineExec = new NarrateExecutorService(baselineNarratorAgent as any, undefined);
  const baseline = await baselineExec.execute(dso, ctx);

  // 2) IronShield: constraints engine injected → physical hints are injected into tips.
  const ironExec = new NarrateExecutorService(baselineNarratorAgent as any, constraintsEngine as any);
  const iron = await ironExec.execute(dso, ctx);

  // Print diff-friendly output
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        baseline: {
          tips: baseline.narration.tips ?? [],
          warnings: (baseline.narration as any).warnings ?? [],
        },
        iron_shield: {
          tips: iron.narration.tips ?? [],
          warnings: (iron.narration as any).warnings ?? [],
        },
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

