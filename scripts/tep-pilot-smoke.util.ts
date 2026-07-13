import { join } from 'path';
import { config as loadEnv } from 'dotenv';
import type { PrismaClient } from '@prisma/client';
import type { PrismaService } from '../src/prisma/prisma.service';
import { buildIsCertWritebackStack } from '../src/trips/tep/certification/is-cert-writeback.harness';
import {
  projectDailyDrivePlans,
  type ItineraryItemRow,
  type TripDayRow,
} from '../src/trips/tep/projectors/daily-drive-plan.projector';
import type { RecoveryGraph } from '../src/trips/tep/contracts/tep-self-drive.types';
import type { Rfc001PlanVersionStoreService } from '../src/trips/guardian-decision-core/plan-version/plan-version.store';
import type { TepLocalRepairApplyService } from '../src/trips/tep/services/tep-local-repair-apply.service';

const PROJECT_ROOT = join(__dirname, '..');

export type TepPilotSmokeTemplate = '01' | '03' | 'all';

export function parseSmokeTemplate(argv: string[]): TepPilotSmokeTemplate {
  const hit = argv.find((a) => a.startsWith('--template='));
  const raw = hit?.split('=').slice(1).join('=') ?? '01';
  if (raw === '01' || raw === '03' || raw === 'all') return raw;
  throw new Error(`Unknown --template=${raw} (use 01|03|all)`);
}

export function parseEnvProfile(argv: string[]): 'staging' | 'default' {
  const hit = argv.find((a) => a.startsWith('--env='));
  const explicit = hit?.split('=').slice(1).join('=');
  if (explicit === 'default' || explicit === 'local') return 'default';
  return 'staging';
}

export function loadProjectEnv(profile: 'staging' | 'default'): void {
  loadEnv({ path: join(PROJECT_ROOT, '.env') });
  if (profile === 'staging') {
    loadEnv({ path: join(PROJECT_ROOT, '.env.staging'), override: true });
  }
}

export function assertSafeDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url) throw new Error('DATABASE_URL not set');
  if (/tripnara_prod|production/i.test(url)) {
    throw new Error('Refusing TEP pilot smoke on production DATABASE_URL');
  }
}

export async function projectDailyDrivePlansForTrip(
  prisma: PrismaClient,
  tripId: string,
) {
  const tripDays = await prisma.tripDay.findMany({
    where: { tripId },
    select: { id: true, date: true },
    orderBy: { date: 'asc' },
  });

  const items = await prisma.itineraryItem.findMany({
    where: { tripDayId: { in: tripDays.map((d) => d.id) } },
    select: {
      id: true,
      tripDayId: true,
      type: true,
      order: true,
      startTime: true,
      endTime: true,
      note: true,
      placeId: true,
      bookingStatus: true,
      costCategory: true,
      travelFromPreviousDuration: true,
      travelFromPreviousDistance: true,
      travelMode: true,
      Place: { select: { nameCN: true, nameEN: true, category: true } },
    },
    orderBy: [{ order: 'asc' }, { id: 'asc' }],
  });

  const itemsByDayId = new Map<string, ItineraryItemRow[]>();
  for (const item of items) {
    const row: ItineraryItemRow = {
      id: item.id,
      tripDayId: item.tripDayId,
      type: item.type,
      order: item.order,
      startTime: item.startTime,
      endTime: item.endTime,
      note: item.note,
      placeId: item.placeId,
      placeNameCN: item.Place?.nameCN ?? null,
      placeNameEN: item.Place?.nameEN ?? null,
      placeCategory: item.Place?.category ?? null,
      costCategory: item.costCategory,
      bookingStatus: item.bookingStatus,
      travelFromPreviousDuration: item.travelFromPreviousDuration,
      travelFromPreviousDistance: item.travelFromPreviousDistance,
      travelMode: item.travelMode,
    };
    const bucket = itemsByDayId.get(item.tripDayId) ?? [];
    bucket.push(row);
    itemsByDayId.set(item.tripDayId, bucket);
  }

  return projectDailyDrivePlans({
    tripId,
    planVersionId: 'effective',
    tripDays: tripDays as TripDayRow[],
    itemsByDayId,
  });
}

export function readSeededRecoveryGraph(metadata: Record<string, unknown>): RecoveryGraph | undefined {
  const block = metadata.rfc001PlanVersions as
    | {
        effectivePlanVersionId?: string;
        items?: Array<{
          planVersionId?: string;
          metadata?: { tep?: { recoveryGraph?: RecoveryGraph } };
        }>;
      }
    | undefined;
  const effectiveId = block?.effectivePlanVersionId;
  const item =
    block?.items?.find((row) => row.planVersionId === effectiveId) ?? block?.items?.[0];
  return item?.metadata?.tep?.recoveryGraph;
}

export function buildPilotWritebackStack(prisma: PrismaClient): {
  apply: TepLocalRepairApplyService;
  planVersionStore: Rfc001PlanVersionStoreService;
} {
  process.env.RFC001_ITINERARY_MATERIALIZE = '1';
  return buildIsCertWritebackStack(prisma as unknown as PrismaService, {
    executability: {
      getExecutability: async (tripId: string) => ({
        tripId,
        hooksPersisted: true,
      }),
    } as unknown as import('../src/trips/tep/services/executability-assessment.service').ExecutabilityAssessmentService,
  });
}
