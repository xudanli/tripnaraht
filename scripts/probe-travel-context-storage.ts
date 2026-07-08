/**
 * Inspect Travel Context storage for a trip: DB anchors + revision journal rows.
 *
 * Usage:
 *   npx tsx scripts/probe-travel-context-storage.ts [tripId]
 *   npx tsx scripts/probe-travel-context-storage.ts --context <contextId>
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readTravelContextIdFromTripMetadata } from '../src/travel-context/domain/travel-context-identity.util';
import { ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID } from '../src/trips/decision-semantics/fixtures/iceland-unified-decision.fixture';

const args = process.argv.slice(2);
const contextFlagIdx = args.indexOf('--context');
const contextIdArg = contextFlagIdx >= 0 ? args[contextFlagIdx + 1] : undefined;
const tripId = contextIdArg ? undefined : (args.find((a) => !a.startsWith('--')) ?? ICELAND_UNIFIED_DECISION_FIXTURE_TRIP_ID);

async function main() {
  const prisma = new PrismaClient();

  try {
    let contextId = contextIdArg;
    let trip: {
      id: string;
      name: string | null;
      metadata: unknown;
      updatedAt: Date;
    } | null = null;

    if (tripId) {
      trip = await prisma.trip.findUnique({
        where: { id: tripId },
        select: { id: true, name: true, metadata: true, updatedAt: true },
      });
      if (!trip) {
        console.error(`Trip not found: ${tripId}`);
        process.exit(1);
      }
      const meta = (trip.metadata ?? {}) as Record<string, unknown>;
      contextId =
        readTravelContextIdFromTripMetadata(meta) ??
        (typeof meta.explorationScenarioId === 'string' ? meta.explorationScenarioId : tripId);
    }

    if (!contextId) {
      console.error('Provide tripId or --context <contextId>');
      process.exit(1);
    }

    const scenario = await prisma.explorationScenario.findFirst({
      where: { OR: [{ contextId }, { id: contextId }, { tripId: trip?.id ?? tripId }] },
      select: {
        id: true,
        contextId: true,
        tripId: true,
        status: true,
        materializedAt: true,
        updatedAt: true,
      },
    });

    let journalRows: Array<{
      fromRevision: bigint;
      toRevision: bigint;
      intentType: string | null;
      snapshotId: string | null;
      createdAt: Date;
    }> = [];

    let archiveRows: Array<{
      revision: bigint;
      snapshotId: string;
      stage: string;
      archiveSource: string;
      intentType: string | null;
      createdAt: Date;
    }> = [];

    try {
      journalRows = await prisma.travelContextRevisionJournalEntry.findMany({
        where: { contextId },
        orderBy: { fromRevision: 'asc' },
        take: 20,
        select: {
          fromRevision: true,
          toRevision: true,
          intentType: true,
          snapshotId: true,
          createdAt: true,
        },
      });
    } catch (err) {
      console.warn(
        'Revision journal table not available — run prisma/migrations/add_travel_context_revision_journal.sql',
      );
      console.warn(String(err));
    }

    try {
      archiveRows = await prisma.travelContextSnapshotArchiveEntry.findMany({
        where: { contextId },
        orderBy: { revision: 'desc' },
        take: 10,
        select: {
          revision: true,
          snapshotId: true,
          stage: true,
          archiveSource: true,
          intentType: true,
          createdAt: true,
        },
      });
    } catch (err) {
      console.warn(
        'Snapshot archive table not available — run prisma/migrations/add_travel_context_snapshot_archive.sql',
      );
      console.warn(String(err));
    }

    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const travelContext = meta.travelContext as Record<string, unknown> | undefined;

    console.log(
      JSON.stringify(
        {
          storageModel: {
            fullSnapshotInDb: false,
            snapshotArchive: true,
            note: '完整 Snapshot 按需 assemble；revision diff 在 travel_context_revision_journal；point-in-time 快照在 travel_context_snapshot_archive',
          },
          trip: trip
            ? {
                id: trip.id,
                name: trip.name,
                updatedAt: trip.updatedAt.toISOString(),
              }
            : null,
          anchors: {
            contextId,
            travelContextId: meta.travelContextId ?? null,
            explorationScenarioId: meta.explorationScenarioId ?? null,
            hasExplorationArchive: Boolean(travelContext?.explorationArchive),
            constraintsVersion: meta.constraintsVersion ?? null,
            tripVersion: meta.tripVersion ?? null,
          },
          explorationScenario: scenario,
          revisionJournal: {
            rowCount: journalRows.length,
            rows: journalRows.map((row) => ({
              fromRevision: Number(row.fromRevision),
              toRevision: Number(row.toRevision),
              intentType: row.intentType,
              snapshotId: row.snapshotId,
              createdAt: row.createdAt.toISOString(),
            })),
          },
          snapshotArchive: {
            rowCount: archiveRows.length,
            rows: archiveRows.map((row) => ({
              revision: Number(row.revision),
              snapshotId: row.snapshotId,
              stage: row.stage,
              archiveSource: row.archiveSource,
              intentType: row.intentType,
              createdAt: row.createdAt.toISOString(),
            })),
          },
          readApis: {
            resolveByTrip: trip ? `/api/travel-contexts/resolve/by-trip/${trip.id}` : null,
            diff: `/api/travel-contexts/${contextId}/diff?sinceRevision=0`,
            events: `/api/travel-contexts/${contextId}/events`,
            snapshotArchiveList: `/api/travel-contexts/${contextId}/snapshots`,
            snapshotArchiveReplay: `/api/travel-contexts/${contextId}/snapshots/{revision}`,
          },
        },
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
