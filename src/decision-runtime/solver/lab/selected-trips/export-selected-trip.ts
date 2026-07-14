/**
 * Export a deidentified selected-trip pack (copy — never wire to live mutable refs).
 *
 * From gold staging:
 *   npm run lab:export-selected-trip -- --from-gold iceland.road_close.01_f208_reroute_a1_a2
 *
 * Template stub:
 *   npm run lab:export-selected-trip -- --tripId trip_xxx --operation REROUTE --deidentify
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PACKS_ROOT } from './validate-selected-trip';
import type {
  ConstraintsFile,
  EffectivePlanFile,
  EvidenceSnapshotFile,
  ExpectedOutcomeFile,
  SelectedTripManifest,
  TravelMatrixFile,
  TriggerFile,
  TripContextFile,
} from './schema/types';

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}

function writeJson(path: string, body: unknown): void {
  writeFileSync(path, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function deidentifyDeep<T>(value: T): T {
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => deidentifyDeep(v)) as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const lk = k.toLowerCase();
    if (
      lk.includes('email') ||
      lk.includes('phone') ||
      lk.includes('name') ||
      lk.includes('passport') ||
      lk.includes('payment') ||
      lk.includes('card')
    ) {
      continue;
    }
    out[k] = deidentifyDeep(v);
  }
  return out as T;
}

interface GoldScenario {
  scenarioId: string;
  countryCode?: string;
  solverProblemRef?: string;
  evidencePackRef?: string;
  provenance?: string;
}

interface SolverProblem {
  tripId?: string;
  planVersionId?: string;
  evidenceVersionId?: string;
  snapshotId?: string;
  operation?: string;
  nodes?: Array<{
    nodeId: string;
    sourceActivityId?: string;
    poiId?: string;
    isBooked?: boolean;
    canRemove?: boolean;
    serviceDurationMin?: number;
    timeWindows?: Array<{ startMin: number; endMin: number }>;
    lat?: number;
    lng?: number;
  }>;
  travelTimeMatrixMin?: number[][];
  nodeOrder?: string[];
  constraints?: Array<{ type?: string; id?: string; hard?: boolean }>;
}

function exportFromGold(scenarioId: string, deidentify: boolean): string {
  const goldRoot = join(
    process.cwd(),
    'src/decision-runtime/solver/lab/gold',
  );
  const manifestPath = join(goldRoot, 'manifest.v1.json');
  const man = loadJson<{
    scenarios: Array<{ scenarioId: string; path: string }>;
  }>(manifestPath);
  const entry = man.scenarios.find((s) => s.scenarioId === scenarioId);
  if (!entry) throw new Error(`gold scenario not found: ${scenarioId}`);
  const scen = loadJson<GoldScenario>(join(goldRoot, entry.path));
  if (!scen.solverProblemRef) throw new Error('solverProblemRef missing');
  const problem = loadJson<SolverProblem>(
    join(process.cwd(), scen.solverProblemRef),
  );
  const tripId = `pilot_${scenarioId.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  const planVersionId = problem.planVersionId ?? `pv_${tripId}`;
  const evidenceVersionId =
    problem.evidenceVersionId ?? problem.snapshotId ?? `ev_${tripId}`;
  const operation = (problem.operation ?? 'REROUTE').toUpperCase();

  const nodes = (problem.nodes ?? []).filter((n) => n.nodeId !== 'depot');
  const plan: EffectivePlanFile = {
    schemaId: 'tripnara.selected_trip.effective_plan@v1',
    tripId,
    planVersionId,
    days: [
      {
        dayId: 'day-1',
        date: '2026-06-12',
        activities: nodes.map((n, i) => ({
          activityId: n.sourceActivityId ?? n.nodeId,
          poiId: n.poiId ?? n.nodeId,
          dayId: 'day-1',
          isBooked: Boolean(n.isBooked),
          canRemove: n.canRemove,
          serviceDurationMin: n.serviceDurationMin,
          timeWindow: n.timeWindows?.[0],
          lat: n.lat ?? 63.4 + i * 0.01,
          lng: n.lng ?? -19.0 - i * 0.01,
        })),
      },
    ],
  };

  const order = problem.nodeOrder ?? [
    'depot',
    ...nodes.map((n) => n.nodeId),
  ];
  const idToIdx = new Map(order.map((id, i) => [id, i]));
  const edges: TravelMatrixFile['edges'] = [];
  const mat = problem.travelTimeMatrixMin;
  if (mat) {
    for (let i = 0; i < order.length; i += 1) {
      for (let j = 0; j < order.length; j += 1) {
        if (i === j) continue;
        const d = mat[i]?.[j];
        if (typeof d === 'number') {
          edges.push({ from: order[i], to: order[j], durationMin: d });
        }
      }
    }
  }
  // Also emit poi-keyed sequential edges for rebuild checks
  const acts = plan.days[0].activities;
  for (let i = 0; i < acts.length - 1; i += 1) {
    const from = acts[i].poiId!;
    const to = acts[i + 1].poiId!;
    const ai = idToIdx.get(nodes[i]?.nodeId ?? '');
    const aj = idToIdx.get(nodes[i + 1]?.nodeId ?? '');
    const d =
      ai != null && aj != null && mat ? mat[ai]?.[aj] : 30 + i * 5;
    if (typeof d === 'number') {
      edges.push({ from, to, durationMin: d });
    }
  }

  let evidenceEvent: Record<string, unknown> | undefined;
  let sources: EvidenceSnapshotFile['sources'] = [
    { provider: 'gold_export', ref: scenarioId },
  ];
  if (scen.evidencePackRef) {
    const pack = loadJson<{
      event?: Record<string, unknown>;
      sourceRefs?: Array<{ provider: string; ref: string }>;
      capturedAt?: string;
    }>(join(process.cwd(), scen.evidencePackRef));
    evidenceEvent = pack.event;
    if (pack.sourceRefs?.length) {
      sources = pack.sourceRefs.map((s) => ({
        provider: s.provider,
        ref: s.ref,
      }));
    }
  }

  const dir = join(PACKS_ROOT, tripId);
  mkdirSync(dir, { recursive: true });

  const context: TripContextFile = {
    schemaId: 'tripnara.selected_trip.context@v1',
    tripId,
    planVersionId,
    timezone: 'Atlantic/Reykjavik',
    dateRange: { startDate: '2026-06-12', endDate: '2026-06-12' },
    destination: scen.countryCode ?? 'IS',
    deidentified: true,
    notes: [`exported from gold ${scenarioId}`, 'frozen copy — not live'],
  };

  const constraints: ConstraintsFile = {
    schemaId: 'tripnara.selected_trip.constraints@v1',
    tripId,
    planVersionId,
    constraints: (problem.constraints ?? []).map((c, i) => ({
      canonicalId: c.id ?? `constraint_${i}`,
      kind: c.type ?? 'UNKNOWN',
      hard: c.hard !== false,
    })),
  };
  if (!constraints.constraints.length) {
    constraints.constraints.push({
      canonicalId: 'road.close.export',
      kind: 'EDGE_FORBIDDEN',
      hard: true,
    });
  }

  const matrix: TravelMatrixFile = {
    schemaId: 'tripnara.selected_trip.travel_matrix@v1',
    tripId,
    unit: 'minutes',
    edges,
  };

  const trigger: TriggerFile = {
    schemaId: 'tripnara.selected_trip.trigger@v1',
    tripId,
    planVersionId,
    evidenceVersionId,
    operation,
    kind: 'ROAD_OR_SCHEDULE_STRESS',
    notes: ['template from gold — refine for pilot'],
  };

  const expected: ExpectedOutcomeFile = {
    schemaId: 'tripnara.selected_trip.expected_outcome@v1',
    tripId,
    expectation: 'accept',
    maxChangedActivities: 4,
    mustPreserveBooked: true,
    gateway: 'PASS',
    notes: ['TODO: human review before RA-01B'],
  };

  const evidence: EvidenceSnapshotFile = {
    schemaId: 'tripnara.selected_trip.evidence@v1',
    tripId,
    evidenceVersionId,
    frozenAt: new Date().toISOString(),
    sources,
    event: evidenceEvent,
  };

  const manifest: SelectedTripManifest = {
    schemaId: 'tripnara.selected_trip.manifest@v1',
    tripId,
    planVersionId,
    evidenceVersionId,
    environment: 'staging-test',
    destination: 'IS',
    intendedOperation: operation,
    timezone: 'Atlantic/Reykjavik',
    source: scen.provenance === 'staging_replay' ? 'gold_replay' : 'synthetic',
    deidentified: true,
    eligibility: 'pending',
  };

  const bodies: Record<string, unknown> = {
    'manifest.json': manifest,
    'trip-context.json': context,
    'effective-plan.json': plan,
    'evidence-snapshot.json': evidence,
    'constraints.json': constraints,
    'travel-matrix.json': matrix,
    'trigger.json': trigger,
    'expected-outcome.json': expected,
  };
  for (const [name, body] of Object.entries(bodies)) {
    writeJson(join(dir, name), deidentify ? deidentifyDeep(body) : body);
  }
  return dir;
}

function exportStub(tripId: string, operation: string): string {
  const planVersionId = `pv_${tripId}`;
  const evidenceVersionId = `ev_${tripId}`;
  const dir = join(PACKS_ROOT, tripId);
  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'manifest.json'), {
    schemaId: 'tripnara.selected_trip.manifest@v1',
    tripId,
    planVersionId,
    evidenceVersionId,
    environment: 'staging',
    destination: 'IS',
    intendedOperation: operation,
    timezone: 'Atlantic/Reykjavik',
    source: 'staging_export',
    deidentified: true,
    eligibility: 'pending',
  } satisfies SelectedTripManifest);
  writeJson(join(dir, 'trip-context.json'), {
    schemaId: 'tripnara.selected_trip.context@v1',
    tripId,
    planVersionId,
    timezone: 'Atlantic/Reykjavik',
    dateRange: { startDate: 'TBD', endDate: 'TBD' },
    destination: 'IS',
    deidentified: true,
    notes: ['stub — replace with staging export'],
  } satisfies TripContextFile);
  writeJson(join(dir, 'effective-plan.json'), {
    schemaId: 'tripnara.selected_trip.effective_plan@v1',
    tripId,
    planVersionId,
    days: [
      {
        dayId: 'day-1',
        activities: [
          {
            activityId: 'act_stub_1',
            poiId: 'poi_stub_1',
            dayId: 'day-1',
            isBooked: false,
            timeWindow: { startMin: 540, endMin: 720 },
            lat: 64.14,
            lng: -21.9,
          },
        ],
      },
    ],
  } satisfies EffectivePlanFile);
  writeJson(join(dir, 'evidence-snapshot.json'), {
    schemaId: 'tripnara.selected_trip.evidence@v1',
    tripId,
    evidenceVersionId,
    frozenAt: new Date().toISOString(),
    sources: [{ provider: 'stub', ref: 'fill-me' }],
  } satisfies EvidenceSnapshotFile);
  writeJson(join(dir, 'constraints.json'), {
    schemaId: 'tripnara.selected_trip.constraints@v1',
    tripId,
    planVersionId,
    constraints: [],
  } satisfies ConstraintsFile);
  writeJson(join(dir, 'travel-matrix.json'), {
    schemaId: 'tripnara.selected_trip.travel_matrix@v1',
    tripId,
    unit: 'minutes',
    edges: [],
  } satisfies TravelMatrixFile);
  writeJson(join(dir, 'trigger.json'), {
    schemaId: 'tripnara.selected_trip.trigger@v1',
    tripId,
    planVersionId,
    evidenceVersionId,
    operation,
    kind: 'TBD',
    notes: ['fill trigger after import'],
  } satisfies TriggerFile);
  writeJson(join(dir, 'expected-outcome.json'), {
    schemaId: 'tripnara.selected_trip.expected_outcome@v1',
    tripId,
    expectation: 'accept',
    mustPreserveBooked: true,
    notes: ['TODO human review'],
  } satisfies ExpectedOutcomeFile);
  return dir;
}

async function main(): Promise<number> {
  const fromGold = argValue('--from-gold');
  const tripId = argValue('--tripId');
  const operation = (argValue('--operation') ?? 'REROUTE').toUpperCase();
  const deidentify = process.argv.includes('--deidentify') || true;

  let dir: string;
  if (fromGold) {
    dir = exportFromGold(fromGold, deidentify);
  } else if (tripId) {
    dir = exportStub(tripId, operation);
  } else {
    console.error(
      'Usage: --from-gold <scenarioId> | --tripId <id> [--operation REROUTE] [--deidentify]',
    );
    return 1;
  }
  console.log(
    JSON.stringify(
      {
        exported: dir.replace(`${process.cwd()}/`, ''),
        next: [
          `npm run lab:validate-selected-trip -- --tripId ${dir.split('/').pop()}`,
          'Fill expected-outcome.json reviewedBy',
        ],
      },
      null,
      2,
    ),
  );
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
