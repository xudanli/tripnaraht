#!/usr/bin/env npx tsx
/**
 * Seed Iceland TEP Limited Pilot fixtures (PILOT-IS-01～10).
 *
 * Usage:
 *   npm run tep:pilot-seed
 *   npm run tep:pilot-seed -- --env=staging --reset
 *   npm run tep:pilot-seed -- --template=02
 *   npm run tep:pilot-seed -- --template=07,08,09,10 --reset
 *   npm run tep:pilot-seed -- --template=all --reset
 */
import 'reflect-metadata';
import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  TEP_PILOT_TRIP_BY_TEMPLATE,
  parsePilotTemplateArg,
} from './tep-pilot-is-seed.constants';
import {
  cleanupPilotTrip,
  ensurePilotUser,
  seedPilotTemplate,
} from './tep-pilot-is-seed.util';

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

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback;
}

function assertSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing TEP pilot seed on production DATABASE_URL');
  }
}

async function main(): Promise<void> {
  const profile = parseEnvProfile(process.argv);
  loadProjectEnv(profile);
  assertSafeDatabase();

  const templates = parsePilotTemplateArg(arg('template', '01') ?? '01');
  const reset = process.argv.includes('--reset');

  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const now = new Date();
    await ensurePilotUser(prisma, now);

    const tripIdsToReset = templates.map((t) => TEP_PILOT_TRIP_BY_TEMPLATE[t]);

    if (reset) {
      for (const tripId of tripIdsToReset) {
        await cleanupPilotTrip(prisma, tripId);
      }
    } else {
      for (const t of templates) {
        const tripId = TEP_PILOT_TRIP_BY_TEMPLATE[t];
        const existing = await prisma.trip.findUnique({ where: { id: tripId }, select: { id: true } });
        if (existing) {
          throw new Error(`Trip ${tripId} already exists — pass --reset to recreate`);
        }
      }
    }

    const results: Record<string, unknown>[] = [];
    for (const t of templates) {
      const normalized = t === '302' ? '01' : t;
      results.push(await seedPilotTemplate(prisma, normalized));
    }

    console.log(
      JSON.stringify(
        templates.length > 1 ? { ok: true, templates: results } : results[0],
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
