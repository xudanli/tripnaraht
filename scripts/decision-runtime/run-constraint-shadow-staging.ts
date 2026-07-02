/**
 * Constraint Gateway SHADOW_COMPARE staging probe — HTTP smoke + divergence report.
 *
 * Usage:
 *   npm run constraint-shadow:staging
 *   npx tsx scripts/decision-runtime/run-constraint-shadow-staging.ts [baseUrl]
 *
 * Requires server with:
 *   CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE
 *   CONSTRAINT_EVALUATION_GATEWAY_ENABLED=1 (or MODE alone)
 *   DECISION_PACK_RULES=1 (for iceland-pack-road-closed divergence probe)
 *
 * Env:
 *   CONSTRAINT_SHADOW_BASE_URL (default http://localhost:3000/api)
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { buildTripExecutionSemanticViewSnapshot } from '../../src/trips/decision/execution/trip-execution-semantic-view.builder';

const DEFAULT_BASE = (
  process.env.CONSTRAINT_SHADOW_BASE_URL ?? 'http://localhost:3000/api'
).replace(/\/$/, '');
const ARTIFACT_DIR = path.join(
  process.cwd(),
  'artifacts',
  'constraint-shadow-staging',
);

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

type RuntimeCapabilities = {
  constraintGatewayMode?: string;
  constraintGatewayShadowCompare?: boolean;
  constraintGatewayOnForSelected?: boolean;
  constraintGatewayOnScenarios?: string[];
  constraintShadowMetrics?: {
    comparedTotal: number;
    divergedTotal: number;
    byDivergenceKind: Record<string, number>;
  };
  generatedAt?: string;
};

type StagingMode = 'SHADOW_COMPARE' | 'ON_FOR_SELECTED';

function resolveStagingMode(caps: RuntimeCapabilities): StagingMode | null {
  if (caps.constraintGatewayOnForSelected) return 'ON_FOR_SELECTED';
  if (caps.constraintGatewayShadowCompare) return 'SHADOW_COMPARE';
  if (caps.constraintGatewayMode === 'ON_FOR_SELECTED') return 'ON_FOR_SELECTED';
  if (caps.constraintGatewayMode === 'SHADOW_COMPARE') return 'SHADOW_COMPARE';
  return null;
}

function isGatewayStagingReady(caps: RuntimeCapabilities): boolean {
  return resolveStagingMode(caps) !== null;
}

type CheckConstraintsResult = {
  feasible?: boolean;
  constraintShadowComparison?: {
    diverged: boolean;
    divergenceKind: string;
  };
};

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [constraint-shadow] ${line}`);
}

async function api<T>(
  method: string,
  baseUrl: string,
  apiPath: string,
  body?: unknown,
): Promise<{ status: number; json: ApiResponse<T> }> {
  try {
    const res = await fetch(`${baseUrl}${apiPath}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as ApiResponse<T>;
    return { status: res.status, json };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`fetch ${apiPath} failed: ${message}`);
  }
}

function icelandContextBase() {
  return {
    destination: 'Iceland',
    startDate: '2026-06-10',
    durationDays: 1,
    budget: { amount: 3000, currency: 'USD' },
    preferences: {
      intents: {},
      pace: 'moderate',
      riskTolerance: 'medium',
      maxDailyActiveMinutes: 360,
    },
  };
}

function emptyDayPlan() {
  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    days: [{ day: 1, date: '2026-06-10', timeSlots: [] }],
  };
}

function baseProbeState() {
  const state = {
    context: {
      destination: 'Iceland',
      startDate: '2026-06-10',
      durationDays: 1,
      budget: { amount: 3000, currency: 'USD' },
      preferences: {
        intents: {},
        pace: 'moderate',
        riskTolerance: 'medium',
        maxDailyActiveMinutes: 360,
      },
    },
    candidatesByDate: {
      '2026-06-10': [
        {
          id: 'poi-outdoor',
          name: { en: 'Outdoor hike' },
          type: 'nature',
          durationMin: 120,
          indoorOutdoor: 'outdoor',
          weatherSensitivity: 3,
        },
      ],
    },
    signals: {
      lastUpdatedAt: new Date().toISOString(),
      weatherByDate: {
        '2026-06-10': { condition: 'storm', precipitationMm: 50 },
      },
      alerts: [{ code: 'WEATHER_STORM', severity: 'critical', message: 'storm' }],
      weatherProhibitsOutdoor: true,
    },
    policies: { maxBudgetOverrunRatio: 1.05 },
  };

  state.signals.executionSemanticView = buildTripExecutionSemanticViewSnapshot({
    weatherByDate: state.signals.weatherByDate,
    alerts: state.signals.alerts,
    planDates: ['2026-06-10'],
  });

  return state;
}

function baseProbePlan(feasibleVariant: boolean, variant?: 'weather' | 'daily-load' | 'empty') {
  const kind = variant ?? (feasibleVariant ? 'empty' : 'weather');
  if (kind === 'empty') {
    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-10',
          timeSlots: [],
        },
      ],
    };
  }

  if (kind === 'daily-load') {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      id: `s${i + 1}`,
      time: `${8 + i}:00`,
      endTime: `${9 + i}:00`,
      title: `Activity ${i + 1}`,
      type: 'activity',
      durationMin: 90,
    }));
    return {
      version: '1.0',
      createdAt: new Date().toISOString(),
      days: [{ day: 1, date: '2026-06-10', timeSlots: slots }],
    };
  }

  return {
    version: '1.0',
    createdAt: new Date().toISOString(),
    days: [
      {
        day: 1,
        date: '2026-06-10',
        timeSlots: [
          {
            id: 's1',
            time: '09:00',
            endTime: '11:00',
            title: 'Outdoor hike',
            type: 'nature',
            poiId: 'poi-outdoor',
          },
        ],
      },
    ],
  };
}

const PROBES = [
  { id: 'feasible-empty-day', feasibleVariant: true, variant: 'empty' as const },
  { id: 'weather-outdoor-storm', feasibleVariant: false, variant: 'weather' as const, onSelectedScenarioId: 'weather-outdoor-storm' },
  {
    id: 'daily-load-excessive',
    onSelectedScenarioId: 'daily-load-excessive',
    build: () => ({
      state: {
        context: { ...icelandContextBase(), travelModeDefault: 'drive' },
        candidatesByDate: {
          '2026-06-10': [
            { id: 'poi-a', name: { en: 'A' }, type: 'sightseeing', durationMin: 60 },
            { id: 'poi-b', name: { en: 'B' }, type: 'sightseeing', durationMin: 60 },
          ],
        },
        signals: {
          lastUpdatedAt: new Date().toISOString(),
          excessiveDailyLoad: true,
          constraintScenarioId: 'daily-load-excessive',
        },
        policies: {
          maxBudgetOverrunRatio: 1.05,
          constraintDSL: {
            hard_constraints: {
              travel_mode: {
                allow_self_drive: true,
                max_daily_drive: { value: 2, unit: 'hour' },
              },
            },
          },
        },
      },
      plan: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-06-10',
            timeSlots: [
              {
                id: 's1',
                time: '09:00',
                endTime: '10:00',
                title: 'A',
                type: 'sightseeing',
                poiId: 'poi-a',
                coordinates: { lat: 64, lng: -22 },
              },
              {
                id: 's2',
                time: '13:00',
                endTime: '14:00',
                title: 'B',
                type: 'sightseeing',
                poiId: 'poi-b',
                coordinates: { lat: 65, lng: -21 },
                travelLegFromPrev: {
                  mode: 'drive',
                  from: { lat: 64, lng: -22 },
                  to: { lat: 65, lng: -21 },
                  durationMin: 180,
                },
              },
            ],
          },
        ],
      },
    }),
  },
  {
    id: 'road-data-unverified-drive',
    expectDiverged: true,
    expectKind: 'LEGACY_PASS_CANONICAL_UNVERIFIED',
    build: () => ({
      state: {
        context: { ...icelandContextBase(), travelModeDefault: 'drive' },
        candidatesByDate: {},
        signals: { lastUpdatedAt: new Date().toISOString() },
        policies: { maxBudgetOverrunRatio: 1.05 },
        physical: {},
      },
      plan: emptyDayPlan(),
    }),
  },
  {
    id: 'iceland-pack-road-closed',
    onSelectedScenarioId: 'iceland-road-closed',
    expectDiverged: true,
    expectKind: 'LEGACY_PASS_CANONICAL_BLOCK',
    build: () => ({
      state: {
        context: icelandContextBase(),
        candidatesByDate: {},
        signals: { lastUpdatedAt: new Date().toISOString() },
        policies: { maxBudgetOverrunRatio: 1.05 },
        packContext: {
          country: 'IS',
          semanticKey: 'ROAD_SEGMENT_UNAVAILABLE',
          facts: { road: { status: 'CLOSED' } },
          candidateUsesRoute: true,
        },
      },
      plan: emptyDayPlan(),
    }),
  },
  {
    id: 'opening-hours-conflict',
    onSelectedScenarioId: 'opening-hours-conflict',
    build: () => ({
      state: {
        context: icelandContextBase(),
        candidatesByDate: {
          '2026-06-10': [
            {
              id: 'poi-museum',
              name: { en: 'Museum' },
              type: 'museum',
              durationMin: 90,
              indoorOutdoor: 'indoor',
              openingHours: [
                { date: '2026-06-10', windows: [{ start: '14:00', end: '18:00' }] },
              ],
            },
          ],
        },
        signals: {
          lastUpdatedAt: new Date().toISOString(),
          openingHoursConflict: true,
          constraintScenarioId: 'opening-hours-conflict',
        },
        policies: { maxBudgetOverrunRatio: 1.05 },
      },
      plan: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        days: [
          {
            day: 1,
            date: '2026-06-10',
            timeSlots: [
              {
                id: 's1',
                time: '09:00',
                endTime: '10:30',
                title: 'Museum',
                type: 'museum',
                poiId: 'poi-museum',
              },
            ],
          },
        ],
      },
    }),
  },
] as const;

type ProbeDef = (typeof PROBES)[number];

function buildProbeBody(probe: ProbeDef): { state: ReturnType<typeof baseProbeState>; plan: object } {
  if ('build' in probe && typeof probe.build === 'function') {
    return probe.build();
  }
  const body = {
    state: baseProbeState(),
    plan: baseProbePlan(probe.feasibleVariant, probe.variant),
  };
  if ('variant' in probe && probe.variant === 'daily-load') {
    body.state.signals.excessiveDailyLoad = true;
    body.state.signals.constraintScenarioId = 'daily-load-excessive';
  }
  return body;
}

function resolveProbeExpectations(
  probe: ProbeDef,
  stagingMode: StagingMode,
  onScenarios: string[],
): {
  expectFeasible?: boolean;
  expectDiverged?: boolean;
  expectKind?: string;
  expectCanonicalAuthority?: boolean;
} {
  const scenarioId =
    'onSelectedScenarioId' in probe ? probe.onSelectedScenarioId : undefined;
  const canonicalSelected =
    stagingMode === 'ON_FOR_SELECTED' &&
    scenarioId &&
    onScenarios.includes(scenarioId);

  if (stagingMode === 'ON_FOR_SELECTED') {
    if (probe.id === 'feasible-empty-day') {
      return { expectFeasible: true, expectCanonicalAuthority: false };
    }
    if (probe.id === 'road-data-unverified-drive') {
      return {
        expectFeasible: true,
        expectDiverged: true,
        expectKind: 'LEGACY_PASS_CANONICAL_UNVERIFIED',
        expectCanonicalAuthority: false,
      };
    }
    if (canonicalSelected) {
      const divergedExpect =
        'expectDiverged' in probe && probe.expectDiverged !== undefined
          ? probe.expectDiverged
          : undefined;
      return {
        expectFeasible: false,
        expectDiverged: divergedExpect,
        expectKind: divergedExpect ? ('expectKind' in probe ? probe.expectKind : undefined) : undefined,
        expectCanonicalAuthority: true,
      };
    }
  }

  return {
    expectDiverged: 'expectDiverged' in probe ? probe.expectDiverged : undefined,
    expectKind: 'expectKind' in probe ? probe.expectKind : undefined,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const smokeOnly = args.includes('--smoke');
  const baseUrl = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_BASE).replace(/\/$/, '');
  fs.mkdirSync(path.join(ARTIFACT_DIR, 'raw'), { recursive: true });

  log(`baseUrl=${baseUrl}`);

  let capsBefore: { status: number; json: ApiResponse<RuntimeCapabilities> };
  try {
    capsBefore = await api<RuntimeCapabilities>(
      'GET',
      baseUrl,
      '/decision-engine/v1/runtime-capabilities',
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (smokeOnly) {
      log(`SMOKE: server unreachable (${message})`);
      const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        mode: 'smoke',
        note: 'Server not reachable — start dev server with P1 env flags',
        error: message,
      };
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'smoke.json'),
        JSON.stringify(report, null, 2),
      );
      log('smoke report written (server unreachable)');
      return;
    }
    throw err;
  }

  if (!capsBefore.json.success) {
    throw new Error(
      capsBefore.json.error?.message ?? 'runtime-capabilities failed',
    );
  }

  const caps = capsBefore.json.data!;
  if (!isGatewayStagingReady(caps)) {
    if (smokeOnly) {
      log('SMOKE: server not in SHADOW_COMPARE / ON_FOR_SELECTED — skipping divergence probes');
      const report = {
        generatedAt: new Date().toISOString(),
        baseUrl,
        mode: 'smoke',
        capabilities: caps,
        note: 'Set CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE or ON_FOR_SELECTED for full staging',
      };
      fs.writeFileSync(
        path.join(ARTIFACT_DIR, 'smoke.json'),
        JSON.stringify(report, null, 2),
      );
      log(`smoke report written (constraintGatewayMode=${caps.constraintGatewayMode})`);
      return;
    }
    throw new Error(
      'Server not in SHADOW_COMPARE / ON_FOR_SELECTED mode — set CONSTRAINT_GATEWAY_MODE or pass --smoke',
    );
  }

  const stagingMode = resolveStagingMode(caps)!;
  const onScenarios = caps.constraintGatewayOnScenarios ?? [];
  log(
    `capabilities stagingMode=${stagingMode} onScenarios=${onScenarios.join(',') || '(none)'} shadowMetrics=${JSON.stringify(caps.constraintShadowMetrics ?? {})}`,
  );

  const probeResults: Array<{
    probeId: string;
    feasible?: boolean;
    diverged?: boolean;
    divergenceKind?: string;
    httpStatus: number;
    expectDiverged?: boolean;
    expectKind?: string;
    expectFeasible?: boolean;
    expectCanonicalAuthority?: boolean;
    pass?: boolean;
  }> = [];

  for (const probe of PROBES) {
    const { state, plan } = buildProbeBody(probe);
    const body = {
      tripId: 'constraint-shadow-staging-probe',
      state,
      plan,
    };
    const res = await api<CheckConstraintsResult>(
      'POST',
      baseUrl,
      '/decision-engine/v1/check-constraints',
      body,
    );
    const data = res.json.data;
    const expectations = resolveProbeExpectations(probe, stagingMode, onScenarios);
    const expectDiverged = expectations.expectDiverged;
    const expectKind = expectations.expectKind;
    const expectFeasible = expectations.expectFeasible;
    const expectCanonicalAuthority = expectations.expectCanonicalAuthority;
    const diverged = data?.constraintShadowComparison?.diverged;
    const divergenceKind = data?.constraintShadowComparison?.divergenceKind;
    let pass = res.status < 400 && data?.feasible !== undefined;

    if (expectFeasible !== undefined) {
      pass = pass && data?.feasible === expectFeasible;
    }
    if (expectDiverged !== undefined) {
      pass = pass && diverged === expectDiverged;
    }
    if (expectKind !== undefined) {
      pass = pass && divergenceKind === expectKind;
    }
    if (expectCanonicalAuthority === true && expectFeasible === false) {
      pass = pass && data?.feasible === false;
    }

    probeResults.push({
      probeId: probe.id,
      feasible: data?.feasible,
      diverged,
      divergenceKind,
      httpStatus: res.status,
      expectDiverged,
      expectKind,
      expectFeasible,
      expectCanonicalAuthority,
      pass,
    });
    log(
      `probe ${probe.id} feasible=${data?.feasible} diverged=${diverged ?? 'n/a'} kind=${divergenceKind ?? '-'} canonicalAuth=${expectCanonicalAuthority ?? 'n/a'} pass=${pass}`,
    );
  }

  const capsAfter = await api<RuntimeCapabilities>(
    'GET',
    baseUrl,
    '/decision-engine/v1/runtime-capabilities',
  );
  const metrics = capsAfter.json.data?.constraintShadowMetrics;
  const compared = metrics?.comparedTotal ?? 0;
  const diverged = metrics?.divergedTotal ?? 0;
  const divergenceRate = compared > 0 ? diverged / compared : 0;

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    stagingMode,
    constraintGatewayOnScenarios: onScenarios,
    capabilitiesBefore: caps,
    capabilitiesAfter: capsAfter.json.data,
    probes: probeResults,
    summary: {
      comparedTotal: compared,
      divergedTotal: diverged,
      divergenceRate,
      byDivergenceKind: metrics?.byDivergenceKind ?? {},
      divergenceProbes: probeResults.filter((p) => p.expectDiverged).length,
      divergenceProbesPass: probeResults.filter((p) => p.expectDiverged && p.pass).length,
      canonicalAuthorityProbes: probeResults.filter((p) => p.expectCanonicalAuthority).length,
      canonicalAuthorityProbesPass: probeResults.filter(
        (p) => p.expectCanonicalAuthority && p.pass,
      ).length,
    },
  };

  const reportPath = path.join(ARTIFACT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  const md = [
    '# Constraint Gateway Staging Report',
    '',
    `- Base URL: \`${baseUrl}\``,
    `- Staging mode: \`${stagingMode}\``,
    `- ON scenarios: \`${onScenarios.join(', ') || '(none)'}\``,
    `- Probes: ${probeResults.length}`,
    `- Compared (server cumulative): ${compared}`,
    `- Diverged: ${diverged}`,
    `- Divergence rate: ${(divergenceRate * 100).toFixed(1)}%`,
    '',
    '## Probes',
    '',
    '| Probe | Feasible | Diverged | Kind | Expected | Pass |',
    '| --- | --- | --- | --- | --- | --- |',
    ...probeResults.map(
      (p) =>
        `| ${p.probeId} | ${p.feasible ?? '-'} | ${p.diverged ?? '-'} | ${p.divergenceKind ?? '-'} | ${p.expectKind ?? '-'} | ${p.pass ?? '-'} |`,
    ),
    '',
    '## Divergence kinds (cumulative)',
    '',
    ...Object.entries(metrics?.byDivergenceKind ?? {}).map(
      ([k, v]) => `- ${k}: ${v}`,
    ),
  ].join('\n');
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'report.md'), md);

  log(`report written to ${reportPath}`);
  log(
    `summary compared=${compared} diverged=${diverged} rate=${(divergenceRate * 100).toFixed(1)}%`,
  );

  if (probeResults.some((p) => p.pass === false || p.feasible === undefined || p.httpStatus >= 400)) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
