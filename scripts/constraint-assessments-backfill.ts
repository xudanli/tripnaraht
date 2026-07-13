#!/usr/bin/env npx tsx
/**
 * Refresh constraint-assessments for existing trips (via running API).
 *
 * Triggers per trip:
 *   POST /api/trips/:id/feasibility-report/validate
 *   GET  /api/trips/:id/constraint-assessments?refresh=true
 *
 * Usage:
 *   npm run constraint-assessments:backfill -- --dry-run
 *   npm run constraint-assessments:backfill -- --limit=50
 *   npm run constraint-assessments:backfill -- --tripId=<uuid>
 *   npm run constraint-assessments:backfill -- --all --allow-prod
 *   npm run constraint-assessments:backfill -- --baseUrl=http://localhost:3000
 */
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';

const PROJECT_ROOT = join(__dirname, '..');

function parseEnvProfile(argv: string[]): 'staging' | 'default' {
  const hit = argv.find((a) => a.startsWith('--env='));
  const explicit = hit?.split('=').slice(1).join('=');
  if (explicit === 'default' || explicit === 'local') return 'default';
  return 'staging';
}

function loadProjectEnv(profile: 'staging' | 'default'): void {
  loadEnv({ path: join(PROJECT_ROOT, '.env') });
  if (profile === 'staging') {
    loadEnv({ path: join(PROJECT_ROOT, '.env.staging'), override: true });
  }
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function assertDatabaseAllowed(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url) && !flag('allow-prod')) {
    throw new Error(
      'Refusing backfill on production DATABASE_URL without --allow-prod',
    );
  }
}

function isIcelandDestination(destination: string | null | undefined): boolean {
  const code = (destination ?? '').trim().toUpperCase();
  return code === 'IS' || code === 'ICELAND' || code.includes('冰岛');
}

type TripRow = { id: string; name: string | null; destination: string | null; updatedAt: Date };

async function refreshTripViaApi(baseUrl: string, tripId: string, skipValidate: boolean) {
  const prefix = baseUrl.replace(/\/$/, '');

  if (!skipValidate) {
    const validateRes = await fetch(`${prefix}/api/trips/${tripId}/feasibility-report/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!validateRes.ok) {
      const text = await validateRes.text();
      throw new Error(`feasibility validate HTTP ${validateRes.status}: ${text.slice(0, 200)}`);
    }
    const validateBody = (await validateRes.json()) as { success?: boolean; error?: { message?: string } };
    if (validateBody.success === false) {
      throw new Error(validateBody.error?.message ?? 'feasibility validate failed');
    }
  }

  const assessRes = await fetch(
    `${prefix}/api/trips/${tripId}/constraint-assessments?refresh=true`,
  );
  if (!assessRes.ok) {
    const text = await assessRes.text();
    throw new Error(`constraint-assessments HTTP ${assessRes.status}: ${text.slice(0, 200)}`);
  }

  const body = (await assessRes.json()) as {
    success?: boolean;
    data?: {
      items?: Array<{
        constraintKey: string;
        aggregateStatus: string;
        lanes?: { executability?: { status?: string } | null; planning?: { status?: string } | null };
      }>;
    };
    error?: { message?: string };
    statusCode?: number;
    message?: string[];
  };

  if (body.success === false || !body.data?.items) {
    const msg =
      body.error?.message ??
      (Array.isArray(body.message) ? body.message.join('; ') : undefined) ??
      'constraint-assessments empty response';
    throw new Error(msg);
  }

  const blocked = body.data.items.filter((i) =>
    ['EXECUTION_BLOCK', 'PLANNING_BLOCK', 'RUNTIME_BLOCK'].includes(i.aggregateStatus),
  );
  const withExec = body.data.items.filter((i) => i.lanes?.executability != null);
  const withPlanning = body.data.items.filter((i) => i.lanes?.planning != null);

  return {
    itemCount: body.data.items.length,
    blockedCount: blocked.length,
    executabilityLaneCount: withExec.length,
    planningLaneCount: withPlanning.length,
    topBlock: blocked[0]?.constraintKey,
  };
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]!);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  const profile = parseEnvProfile(process.argv);
  loadProjectEnv(profile);
  assertDatabaseAllowed();

  const dryRun = flag('dry-run');
  const skipValidate = flag('skip-validate');
  const includeAll = flag('all');
  const tripId = arg('tripId');
  const icelandOnly = flag('iceland-only') || (!includeAll && !tripId);
  const limit = Number(arg('limit') ?? '0') || undefined;
  const concurrency = Math.max(1, Number(arg('concurrency') ?? '2'));
  const baseUrl = arg('baseUrl') ?? 'http://localhost:3000';

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();

    const trips: TripRow[] = await prisma.trip.findMany({
      where: tripId
        ? { id: tripId }
        : includeAll
          ? {}
          : icelandOnly
            ? {
                OR: [
                  { destination: { equals: 'IS', mode: 'insensitive' } },
                  { destination: { equals: 'ICELAND', mode: 'insensitive' } },
                  { destination: { contains: '冰岛', mode: 'insensitive' } },
                  { destination: { contains: 'iceland', mode: 'insensitive' } },
                ],
              }
            : {},
      select: { id: true, name: true, destination: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });

    if (tripId && trips.length === 0) {
      throw new Error(`Trip ${tripId} not found`);
    }

    const icelandCount = trips.filter((t) => isIcelandDestination(t.destination)).length;
    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'apply',
          database: profile,
          baseUrl,
          tripCount: trips.length,
          icelandCount,
          skipValidate,
          concurrency,
        },
        null,
        2,
      ),
    );

    if (dryRun) {
      console.log(
        JSON.stringify(
          trips.map((t) => ({
            tripId: t.id,
            name: t.name,
            destination: t.destination,
            updatedAt: t.updatedAt.toISOString(),
          })),
          null,
          2,
        ),
      );
      return;
    }

    const health = await fetch(`${baseUrl.replace(/\/$/, '')}/api/trips/${trips[0]!.id}/pipeline-status`).catch(
      () => null,
    );
    if (!health?.ok) {
      throw new Error(
        `API not reachable at ${baseUrl} — start npm run dev first, or pass --baseUrl=...`,
      );
    }

    const results = await mapPool(trips, concurrency, async (trip) => {
      try {
        const summary = await refreshTripViaApi(baseUrl, trip.id, skipValidate);
        return {
          ok: true as const,
          tripId: trip.id,
          name: trip.name,
          destination: trip.destination,
          ...summary,
        };
      } catch (error) {
        return {
          ok: false as const,
          tripId: trip.id,
          name: trip.name,
          destination: trip.destination,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    const ok = results.filter((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    console.log(
      JSON.stringify(
        {
          ok: ok.length,
          failed: failed.length,
          withExecutabilityLane: ok.filter((r) => r.executabilityLaneCount > 0).length,
          withPlanningLane: ok.filter((r) => r.planningLaneCount > 0).length,
          blocked: ok.filter((r) => r.blockedCount > 0).length,
          failures: failed,
          sample: ok.slice(0, 10),
        },
        null,
        2,
      ),
    );

    if (failed.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
