/**
 * Read-only Gate1 Runtime audit against RDS (no Nest bootstrap, no writes).
 *
 * Usage:
 *   npm run gate1:rds-audit
 *   npm run gate1:rds-audit -- --json
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

const PROD_HINT = /tripnara_prod|production/i.test(process.env.DATABASE_URL ?? '');

async function loadEvents(prisma: PrismaClient, tripId: string): Promise<TravelEventRecord[]> {
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

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const json = process.argv.includes('--json');
  const prisma = new PrismaClient();

  try {
    const [totalProjects, withLinkedTrip] = await Promise.all([
      prisma.gate1Project.count(),
      prisma.gate1Project.count({ where: { linkedTripId: { not: null } } }),
    ]);
    const coveragePct =
      totalProjects === 0 ? 100 : Math.round((withLinkedTrip / totalProjects) * 10000) / 100;

    let outbox: Record<string, number> | null = null;
    try {
      const groups = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
        SELECT status, COUNT(*)::bigint AS cnt FROM runtime_event_outbox GROUP BY status
      `;
      outbox = Object.fromEntries(groups.map((g) => [g.status, Number(g.cnt)]));
    } catch {
      outbox = null;
    }

    const gate1EventCount = await prisma.travelEvent.count({
      where: {
        OR: [{ source: 'gate1.runtime' }, { eventType: { startsWith: 'gate1.' } }],
      },
    });

    const eventTypes = await prisma.travelEvent.groupBy({
      by: ['eventType'],
      where: {
        OR: [{ source: 'gate1.runtime' }, { eventType: { startsWith: 'gate1.' } }],
      },
      _count: true,
      orderBy: { _count: { eventType: 'desc' } },
      take: 15,
    });

    const linkedProjects = await prisma.gate1Project.findMany({
      where: { linkedTripId: { not: null } },
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
        planBs: { where: { status: 'PUBLISHED' }, select: { id: true } },
        outcome: { select: { id: true } },
        readinessReports: {
          select: {
            findings: { where: { status: 'RED' }, select: { id: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });

    let matched = 0;
    let mismatched = 0;
    const mismatchedProjects: Array<{ projectId: string; title: string; entities: string[] }> =
      [];

    for (const project of linkedProjects) {
      if (!project.linkedTripId) continue;
      const events = await loadEvents(prisma, project.linkedTripId);
      const projection = projectDecisionWorkspaceFromEvents(events, project.linkedTripId);
      const redFindingIds = project.readinessReports.flatMap((r) =>
        r.findings.map((f) => f.id),
      );
      const report = reconcileDecisionWorkspace({
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

      if (report.allMatched) matched++;
      else {
        mismatched++;
        mismatchedProjects.push({
          projectId: project.id,
          title: project.title,
          entities: report.entities.filter((e) => !e.matched).map((e) => e.entity),
        });
      }
    }

    const eligible = linkedProjects.length;
    const matchRatePct =
      eligible === 0 ? 100 : Math.round((matched / eligible) * 10000) / 100;

    const pending = outbox?.PENDING ?? outbox?.pending ?? 0;
    const failed = outbox?.FAILED ?? outbox?.failed ?? 0;

    const failures: string[] = [];
    if (coveragePct < 95) failures.push(`linkedTrip coverage ${coveragePct}% < 95%`);
    if (eligible > 0 && matchRatePct < 99) failures.push(`reconcile ${matchRatePct}% < 99%`);
    if (outbox && failed > 0) failures.push(`outbox failed ${failed} > 0`);
    if (outbox && pending > 50) failures.push(`outbox pending ${pending} > 50`);
    if (outbox === null) failures.push('runtime_event_outbox table missing — run migrate deploy');

    const report = {
      generatedAt: new Date().toISOString(),
      readOnly: true,
      databaseHint: PROD_HINT ? 'PRODUCTION (tripnara_prod) — no writes performed' : 'non-prod',
      passed: failures.length === 0,
      failures,
      linkedTripCoverage: {
        totalProjects,
        withLinkedTrip,
        coveragePct,
      },
      outbox,
      reconcile: {
        checked: eligible,
        matched,
        mismatched,
        matchRatePct,
        mismatchedProjects: mismatchedProjects.slice(0, 10),
      },
      travelEvents: {
        gate1EventCount,
        topEventTypes: eventTypes.map((e) => ({
          eventType: e.eventType,
          count: e._count,
        })),
      },
    };

    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log('=== Gate1 Runtime RDS Audit (read-only) ===');
      if (PROD_HINT) {
        console.log('⚠️  DATABASE_URL 指向 tripnara_prod — 仅只读检查，未执行 migrate/backfill');
      }
      console.log(`Passed: ${report.passed ? 'YES' : 'NO'}`);
      console.log(
        `linkedTripId: ${coveragePct}% (${withLinkedTrip}/${totalProjects})`,
      );
      console.log(`Reconcile: ${matchRatePct}% (${matched}/${eligible} matched)`);
      console.log(`Gate1 travel_events: ${gate1EventCount}`);
      if (outbox) console.log(`Outbox: ${JSON.stringify(outbox)}`);
      else console.log('Outbox: table missing');
      if (failures.length) {
        console.log('\nFailures:');
        failures.forEach((f) => console.log(`  - ${f}`));
      }
      if (mismatchedProjects.length) {
        console.log('\nMismatched (top 10):');
        mismatchedProjects.slice(0, 10).forEach((p) => {
          console.log(`  - ${p.title}: ${p.entities.join(', ')}`);
        });
      }
      if (eventTypes.length) {
        console.log('\nTop event types:');
        eventTypes.forEach((e) => console.log(`  ${e.eventType}: ${e._count}`));
      }
    }

    process.exit(report.passed ? 0 : 1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
