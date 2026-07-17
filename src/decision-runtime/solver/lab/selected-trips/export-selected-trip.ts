/**
 * Export a deidentified selected-trip pack (copy — never wire to live mutable refs).
 *
 * From gold:
 *   npm run lab:export-selected-trip -- --from-gold iceland.road_close.01_f208_reroute_a1_a2
 *
 * From staging DB (live freeze):
 *   npm run lab:export-selected-trip -- --from-staging --tripId ra01_is_01 --deidentify
 *   npm run lab:export-selected-trip -- --from-staging --prefix ra01_is_ --deidentify
 *
 * Template stub (no DB):
 *   npm run lab:export-selected-trip -- --tripId trip_xxx --operation REROUTE --deidentify
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PACKS_ROOT } from './validate-selected-trip';
import {
  APPROVED_PILOT_OPERATIONS,
  type ConstraintsFile,
  type EffectivePlanFile,
  type EvidenceSnapshotFile,
  type ExpectedOutcomeFile,
  type SelectedTripManifest,
  type TravelMatrixFile,
  type TriggerFile,
  type TripContextFile,
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

function isoDate(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d;
  return x.toISOString().slice(0, 10);
}

function minutesOfDay(d: Date | null | undefined, fallback: number): number {
  if (!d) return fallback;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

function mapPilotOperation(raw: string | undefined): {
  operation: string;
  expectation: ExpectedOutcomeFile['expectation'];
  gateway: ExpectedOutcomeFile['gateway'];
} {
  const u = (raw ?? 'REROUTE').toUpperCase();
  if (u === 'FALLBACK' || u === 'REJECT') {
    return {
      operation: 'REROUTE',
      expectation: u === 'FALLBACK' ? 'fallback' : 'reject',
      gateway: 'BLOCK',
    };
  }
  if ((APPROVED_PILOT_OPERATIONS as readonly string[]).includes(u)) {
    return { operation: u, expectation: 'accept', gateway: 'PASS' };
  }
  return { operation: 'REROUTE', expectation: 'accept', gateway: 'PASS' };
}

/** South-coast Iceland synthetic anchors when Place coords are missing in staging. */
const IS_ANCHORS: Array<{ lat: number; lng: number }> = [
  { lat: 64.1466, lng: -21.9426 }, // Reykjavik
  { lat: 63.6156, lng: -19.991 }, // Seljalandsfoss area
  { lat: 63.5321, lng: -19.511 }, // Skogafoss area
  { lat: 63.4196, lng: -19.006 }, // Vik area
  { lat: 64.255, lng: -15.208 }, // East approach
];

async function exportFromStaging(tripId: string, deidentify: boolean): Promise<string> {
  loadEnv({ path: join(process.cwd(), '.env') });
  loadEnv({ path: join(process.cwd(), '.env.staging'), override: true });
  const url = process.env.DATABASE_URL ?? '';
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing staging export against production DATABASE_URL');
  }

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new Error(`staging trip not found: ${tripId}`);

    const meta = (trip.metadata ?? {}) as Record<string, unknown>;
    const m4 = (meta.m4Ra01 ?? {}) as Record<string, unknown>;
    const mapped = mapPilotOperation(
      typeof m4.intendedOperation === 'string'
        ? m4.intendedOperation
        : argValue('--operation') ?? 'REROUTE',
    );

    const rfc = meta.rfc001PlanVersions as
      | { items?: Array<{ id?: string; planVersionId?: string; status?: string }> }
      | undefined;
    const effectivePv =
      rfc?.items?.find((i) => i.status === 'EFFECTIVE')?.planVersionId ??
      rfc?.items?.find((i) => i.status === 'EFFECTIVE')?.id ??
      rfc?.items?.[0]?.planVersionId ??
      rfc?.items?.[0]?.id;
    const planVersionId =
      (typeof effectivePv === 'string' && effectivePv) || `pv_${tripId}_staging`;
    const evidenceVersionId = `ev_${tripId}_${isoDate(new Date()).replace(/-/g, '')}`;

    type DayRow = { id: string; date: Date };
    type ItemRow = {
      id: string;
      type: string;
      placeId: number | null;
      note: string | null;
      order: number | null;
      bookedAt: Date | null;
      bookingStatus: string | null;
      startTime: Date | null;
      endTime: Date | null;
      travelFromPreviousDuration: number | null;
      day_id: string;
      date: Date;
    };

    const days = await prisma.$queryRaw<DayRow[]>`
      SELECT id, date FROM "TripDay" WHERE "tripId" = ${tripId} ORDER BY date ASC
    `;
    const items = await prisma.$queryRaw<ItemRow[]>`
      SELECT i.id, i.type, i."placeId", i.note, i."order", i."bookedAt", i."bookingStatus",
             i."startTime", i."endTime", i."travelFromPreviousDuration",
             d.id as day_id, d.date
      FROM "ItineraryItem" i
      JOIN "TripDay" d ON d.id = i."tripDayId"
      WHERE d."tripId" = ${tripId}
      ORDER BY d.date ASC, i."order" ASC NULLS LAST
    `;

    const dayMap = new Map<string, EffectivePlanFile['days'][number]>();
    for (const d of days) {
      dayMap.set(d.id, {
        dayId: d.id,
        date: isoDate(d.date),
        activities: [],
      });
    }
    if (dayMap.size === 0) {
      const fallbackDayId = `${tripId}_day1`;
      dayMap.set(fallbackDayId, {
        dayId: fallbackDayId,
        date: isoDate(trip.startDate),
        activities: [],
      });
    }

    let actIndex = 0;
    for (const item of items) {
      const day =
        dayMap.get(item.day_id) ??
        [...dayMap.values()][0];
      if (!day) continue;
      let noteObj: Record<string, unknown> = {};
      try {
        noteObj = item.note ? (JSON.parse(item.note) as Record<string, unknown>) : {};
      } catch {
        noteObj = {};
      }
      const anchor = IS_ANCHORS[actIndex % IS_ANCHORS.length];
      const startMin = minutesOfDay(item.startTime, 540 + actIndex * 90);
      const dur =
        typeof noteObj.durationMinutes === 'number'
          ? Math.max(30, noteObj.durationMinutes as number)
          : 60;
      const endMin = minutesOfDay(item.endTime, startMin + dur);
      const isBooked =
        Boolean(item.bookedAt) ||
        String(item.bookingStatus ?? '').toUpperCase() === 'CONFIRMED' ||
        String(noteObj.tepFlexibility ?? '') === 'FIXED';
      day.activities.push({
        activityId: item.id,
        poiId: item.placeId != null ? `place_${item.placeId}` : `poi_${item.id}`,
        dayId: day.dayId,
        isBooked,
        canRemove: String(noteObj.tepFlexibility ?? '') === 'REMOVABLE',
        serviceDurationMin: dur,
        timeWindow: { startMin, endMin: Math.max(endMin, startMin + 30) },
        lat: anchor.lat,
        lng: anchor.lng,
      });
      actIndex += 1;
    }

    // Ensure ≥2 activities so travel-matrix can have edges
    for (const day of dayMap.values()) {
      if (day.activities.length >= 2) continue;
      const base = day.activities[0];
      const anchor = IS_ANCHORS[(actIndex + 1) % IS_ANCHORS.length];
      if (!base) {
        day.activities.push({
          activityId: `${day.dayId}_anchor_start`,
          poiId: `${day.dayId}_poi_start`,
          dayId: day.dayId,
          isBooked: false,
          serviceDurationMin: 30,
          timeWindow: { startMin: 540, endMin: 600 },
          lat: IS_ANCHORS[0].lat,
          lng: IS_ANCHORS[0].lng,
        });
      }
      day.activities.push({
        activityId: `${day.dayId}_anchor_end`,
        poiId: `${day.dayId}_poi_end`,
        dayId: day.dayId,
        isBooked: false,
        serviceDurationMin: 45,
        timeWindow: { startMin: 720, endMin: 780 },
        lat: anchor.lat,
        lng: anchor.lng,
      });
    }

    const planDays = [...dayMap.values()];
    const plan: EffectivePlanFile = {
      schemaId: 'tripnara.selected_trip.effective_plan@v1',
      tripId,
      planVersionId,
      days: planDays,
    };

    const edges: TravelMatrixFile['edges'] = [];
    const allActs = planDays.flatMap((d) => d.activities);
    for (let i = 0; i < allActs.length - 1; i += 1) {
      const from = allActs[i].poiId ?? allActs[i].activityId;
      const to = allActs[i + 1].poiId ?? allActs[i + 1].activityId;
      const hop = items[i + 1]?.travelFromPreviousDuration;
      const durationMin =
        typeof hop === 'number' && hop > 0 && hop < 24 * 60
          ? Math.round(hop)
          : 35 + i * 5;
      edges.push({
        from,
        to,
        durationMin,
      });
    }
    // Bidirectional stubs for rebuild flexibility
    for (const e of [...edges]) {
      edges.push({ from: e.to, to: e.from, durationMin: e.durationMin });
    }

    const pacing = (trip.pacingConfig ?? {}) as Record<string, unknown>;
    const constraintsMeta = (meta.constraints ?? {}) as Record<string, unknown>;
    const constraints: ConstraintsFile = {
      schemaId: 'tripnara.selected_trip.constraints@v1',
      tripId,
      planVersionId,
      constraints: [
        {
          canonicalId: 'vehicle.type',
          kind: 'VEHICLE_TYPE',
          hard: true,
        },
        {
          canonicalId: 'pace.max_daily_drive',
          kind: 'MAX_DAILY_DRIVE',
          hard: Boolean(constraintsMeta.maxDailyDriveMinutes ?? pacing.maxDailyDriveMinutes),
        },
      ],
    };
    if (mapped.expectation !== 'accept') {
      constraints.constraints.push({
        canonicalId: 'road.close.or_infeasible',
        kind: 'EDGE_FORBIDDEN',
        hard: true,
      });
    } else if (mapped.operation === 'REROUTE') {
      constraints.constraints.push({
        canonicalId: 'road.close.f_road',
        kind: 'EDGE_FORBIDDEN',
        hard: true,
      });
    }

    const dest =
      trip.destination === 'IS' || trip.destination === 'Iceland' ? 'IS' : trip.destination;

    const context: TripContextFile = {
      schemaId: 'tripnara.selected_trip.context@v1',
      tripId,
      planVersionId,
      timezone: 'Atlantic/Reykjavik',
      dateRange: {
        startDate: isoDate(trip.startDate),
        endDate: isoDate(trip.endDate),
      },
      destination: dest,
      deidentified: true,
      notes: [
        'exported from staging DB',
        `sourceTripId=${typeof m4.sourceTripId === 'string' ? m4.sourceTripId : 'n/a'}`,
        'frozen copy — not live',
      ],
    };

    const evidence: EvidenceSnapshotFile = {
      schemaId: 'tripnara.selected_trip.evidence@v1',
      tripId,
      evidenceVersionId,
      frozenAt: new Date().toISOString(),
      sources: [
        { provider: 'staging_db', ref: tripId },
        {
          provider: 'm4_ra01_seed',
          ref: typeof m4.sourceTripId === 'string' ? m4.sourceTripId : tripId,
        },
      ],
      event: {
        kind: mapped.operation,
        intendedOperation: mapped.operation,
        expectation: mapped.expectation,
      },
    };

    const trigger: TriggerFile = {
      schemaId: 'tripnara.selected_trip.trigger@v1',
      tripId,
      planVersionId,
      evidenceVersionId,
      operation: mapped.operation,
      kind:
        mapped.expectation === 'accept'
          ? 'STAGING_PILOT_STRESS'
          : 'STAGING_NEGATIVE_SAMPLE',
      notes: [
        `mapped from staging metadata intendedOperation=${String(m4.intendedOperation ?? mapped.operation)}`,
      ],
    };

    const expected: ExpectedOutcomeFile = {
      schemaId: 'tripnara.selected_trip.expected_outcome@v1',
      tripId,
      expectation: mapped.expectation,
      maxChangedActivities: mapped.expectation === 'accept' ? 4 : 0,
      mustPreserveBooked: true,
      gateway: mapped.gateway,
      reviewedBy: 'lab-staging-export',
      reviewedAt: isoDate(new Date()),
      notes: [
        mapped.expectation === 'accept'
          ? 'Auto-reviewed staging export — product re-review before whitelist'
          : 'Negative sample — Gateway BLOCK / reject-or-fallback path',
      ],
    };

    const manifest: SelectedTripManifest = {
      schemaId: 'tripnara.selected_trip.manifest@v1',
      tripId,
      planVersionId,
      evidenceVersionId,
      environment: 'staging',
      destination: 'IS',
      intendedOperation: mapped.operation,
      timezone: 'Atlantic/Reykjavik',
      source: 'staging_export',
      deidentified: true,
      eligibility: 'pending',
    };

    const dir = join(PACKS_ROOT, tripId);
    mkdirSync(dir, { recursive: true });
    const bodies: Record<string, unknown> = {
      'manifest.json': manifest,
      'trip-context.json': context,
      'effective-plan.json': plan,
      'evidence-snapshot.json': evidence,
      'constraints.json': constraints,
      'travel-matrix.json': {
        schemaId: 'tripnara.selected_trip.travel_matrix@v1',
        tripId,
        unit: 'minutes',
        edges,
      } satisfies TravelMatrixFile,
      'trigger.json': trigger,
      'expected-outcome.json': expected,
    };
    for (const [name, body] of Object.entries(bodies)) {
      writeJson(join(dir, name), deidentify ? deidentifyDeep(body) : body);
    }
    return dir;
  } finally {
    await prisma.$disconnect();
  }
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
  const fromStaging = process.argv.includes('--from-staging');
  const tripId = argValue('--tripId');
  const prefix = argValue('--prefix');
  const operation = (argValue('--operation') ?? 'REROUTE').toUpperCase();
  const deidentify = process.argv.includes('--deidentify') || true;

  if (fromGold) {
    const dir = exportFromGold(fromGold, deidentify);
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

  if (fromStaging) {
    const ids: string[] = [];
    if (tripId) {
      ids.push(tripId);
    } else if (prefix) {
      // Export contiguous ra01_is_01..N until a gap
      for (let i = 1; i <= 30; i += 1) {
        ids.push(`${prefix}${String(i).padStart(2, '0')}`);
      }
    } else {
      console.error(
        'Usage: --from-staging --tripId <id> | --from-staging --prefix ra01_is_',
      );
      return 1;
    }

    loadEnv({ path: join(process.cwd(), '.env') });
    loadEnv({ path: join(process.cwd(), '.env.staging'), override: true });
    const probe = new PrismaClient();
    const exported: string[] = [];
    const failed: Array<{ tripId: string; error: string }> = [];
    try {
      await probe.$connect();
      for (const id of ids) {
        if (prefix && !tripId) {
          const hit = await probe.trip.findUnique({
            where: { id },
            select: { id: true },
          });
          if (!hit) {
            if (exported.length === 0) {
              failed.push({ tripId: id, error: 'not found' });
            }
            break;
          }
        }
        try {
          const dir = await exportFromStaging(id, deidentify);
          exported.push(dir.replace(`${process.cwd()}/`, ''));
        } catch (e) {
          failed.push({
            tripId: id,
            error: e instanceof Error ? e.message : String(e),
          });
          if (prefix && !tripId) break;
        }
      }
    } finally {
      await probe.$disconnect();
    }

    console.log(
      JSON.stringify(
        {
          exported,
          failed,
          next: [
            'npm run lab:assemble-selected-pilot',
            'npm run lab:pilot-preflight-status',
          ],
        },
        null,
        2,
      ),
    );
    return failed.length && !exported.length ? 1 : 0;
  }

  if (tripId) {
    const dir = exportStub(tripId, operation);
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

  console.error(
    'Usage: --from-gold <scenarioId> | --from-staging --tripId|--prefix … | --tripId <id> [--operation REROUTE]',
  );
  return 1;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
