/**
 * Shadow projection reconciliation: rebuild decision_workspace from travel_events
 * and compare against gate1_* tables.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/reconcile-gate1-runtime-staging.ts
 *   DATABASE_URL=... npx tsx scripts/reconcile-gate1-runtime-staging.ts --project-id=<uuid>
 *   DATABASE_URL=... npx tsx scripts/reconcile-gate1-runtime-staging.ts --json
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  projectDecisionWorkspaceFromEvents,
  reconcileDecisionWorkspace,
  type TravelEventRecord,
} from '../src/decision-runtime/projections/decision-workspace.projection';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

const prisma = new PrismaClient();

function parseArgs() {
  const projectIdArg = process.argv.find((a) => a.startsWith('--project-id='));
  return {
    projectId: projectIdArg?.split('=')[1],
    json: process.argv.includes('--json'),
  };
}

async function loadEvents(tripId: string): Promise<TravelEventRecord[]> {
  const rows = await prisma.travelEvent.findMany({
    where: { tripId },
    orderBy: { occurredAt: 'asc' },
    select: {
      id: true,
      tripId: true,
      eventType: true,
      source: true,
      occurredAt: true,
      payload: true,
      metadata: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    tripId: row.tripId,
    eventType: row.eventType,
    source: row.source,
    occurredAt: row.occurredAt,
    payload: row.payload as Record<string, unknown>,
    metadata: row.metadata as Record<string, unknown> | null,
  }));
}

async function reconcileOne(projectId: string) {
  const project = await prisma.gate1Project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      linkedTripId: true,
      decisions: { select: { id: true } },
      conflictReports: {
        where: { status: 'PUBLISHED' },
        select: { id: true, version: true },
      },
      candidateStrategies: {
        where: { status: 'PUBLISHED' },
        select: { id: true },
      },
      planBs: {
        where: { status: 'PUBLISHED' },
        select: { id: true },
      },
      outcome: { select: { id: true } },
      readinessReports: {
        select: {
          findings: {
            where: { status: 'RED' },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!project) {
    throw new Error(`Project not found: ${projectId}`);
  }

  if (!project.linkedTripId) {
    return {
      projectId: project.id,
      tripId: '',
      projectTitle: project.title,
      linked: false,
      skippedReason: 'no_linked_trip_id',
      allMatched: false,
      entities: [],
    };
  }

  const events = await loadEvents(project.linkedTripId);
  const projection = projectDecisionWorkspaceFromEvents(events, project.linkedTripId);
  const redFindingIds = project.readinessReports.flatMap((r) =>
    r.findings.map((f) => f.id),
  );

  return reconcileDecisionWorkspace({
    projectId: project.id,
    tripId: project.linkedTripId,
    projectTitle: project.title,
    projection,
    gate1DecisionIds: project.decisions.map((d) => d.id),
    gate1PublishedConflictKeys: project.conflictReports.map(
      (r) => `${r.id}:v${r.version}`,
    ),
    gate1PublishedCandidateIds: project.candidateStrategies.map((c) => c.id),
    gate1PublishedPlanBIds: project.planBs.map((p) => p.id),
    gate1OutcomeIds: project.outcome ? [project.outcome.id] : [],
    gate1RedFindingIds: redFindingIds,
  });
}

function printReport(results: Awaited<ReturnType<typeof reconcileOne>>[]) {
  let mismatches = 0;
  let skipped = 0;

  for (const r of results) {
    if ('skippedReason' in r && r.skippedReason) {
      skipped++;
      console.log(`⏭  ${r.projectTitle} (${r.projectId}) — ${r.skippedReason}`);
      continue;
    }

    const status = r.allMatched ? '✅' : '❌';
    if (!r.allMatched) mismatches++;
    console.log(`${status} ${r.projectTitle}`);
    console.log(`   project=${r.projectId} trip=${r.tripId}`);

    for (const e of r.entities) {
      if (e.matched) {
        console.log(`   ✓ ${e.entity}: ${e.gate1Count} matched`);
      } else {
        console.log(`   ✗ ${e.entity}: gate1=${e.gate1Count} events=${e.eventCount}`);
        if (e.missingInEvents.length) {
          console.log(`     missing in events: ${e.missingInEvents.join(', ')}`);
        }
        if (e.extraInEvents.length) {
          console.log(`     extra in events: ${e.extraInEvents.join(', ')}`);
        }
      }
    }
    console.log('');
  }

  console.log('--- Summary ---');
  console.log(`Projects checked: ${results.length}`);
  console.log(`Skipped (no linkedTripId): ${skipped}`);
  console.log(`Mismatches: ${mismatches}`);

  return mismatches;
}

async function main() {
  const { projectId, json } = parseArgs();

  if (process.env.DATABASE_URL?.match(/tripnara_prod|production/i)) {
    console.error('Refusing to run against production DATABASE_URL');
    process.exit(1);
  }

  const projectIds = projectId
    ? [projectId]
    : (
        await prisma.gate1Project.findMany({
          where: { linkedTripId: { not: null } },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
        })
      ).map((p) => p.id);

  const results = [];
  for (const id of projectIds) {
    results.push(await reconcileOne(id));
  }

  if (json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    const mismatches = printReport(results);
    if (mismatches > 0) {
      process.exit(1);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
