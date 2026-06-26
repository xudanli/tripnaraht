/**
 * CI check: Gate1 shadow projection reconciliation must match (linked projects only).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/ci/gate1-runtime-reconcile-check.ts
 *
 * Exit 0 when all linked projects match or none exist; exit 1 on any mismatch.
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { projectDecisionWorkspaceFromEvents, reconcileDecisionWorkspace } from '../../src/decision-runtime/projections/decision-workspace.projection';

loadEnv({ path: path.resolve(__dirname, '..', '..', '.env') });

const prisma = new PrismaClient();

async function reconcileOne(projectId: string) {
  const project = await prisma.gate1Project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      title: true,
      linkedTripId: true,
      decisions: { select: { id: true } },
      conflictReports: { where: { status: 'PUBLISHED' }, select: { id: true, version: true } },
      candidateStrategies: { where: { status: 'PUBLISHED' }, select: { id: true } },
      planBs: { where: { status: 'PUBLISHED' }, select: { id: true } },
      outcome: { select: { id: true } },
      readinessReports: {
        select: {
          findings: {
            where: { status: 'RED', closedAt: null },
            select: { id: true },
          },
        },
      },
    },
  });

  if (!project?.linkedTripId) {
    return { projectId, skipped: true as const };
  }

  const events = await prisma.travelEvent.findMany({
    where: { tripId: project.linkedTripId },
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

  const projection = projectDecisionWorkspaceFromEvents(
    events.map((e) => ({
      ...e,
      payload: e.payload as Record<string, unknown>,
      metadata: e.metadata as Record<string, unknown> | null,
    })),
    project.linkedTripId,
  );

  const report = reconcileDecisionWorkspace({
    projectId: project.id,
    tripId: project.linkedTripId,
    projectTitle: project.title,
    projection,
    gate1DecisionIds: project.decisions.map((d) => d.id),
    gate1PublishedConflictKeys: project.conflictReports.map((r) => `${r.id}:v${r.version}`),
    gate1PublishedCandidateIds: project.candidateStrategies.map((c) => c.id),
    gate1PublishedPlanBIds: project.planBs.map((c) => c.id),
    gate1OutcomeIds: project.outcome ? [project.outcome.id] : [],
    gate1RedFindingIds: project.readinessReports.flatMap((r) => r.findings.map((f) => f.id)),
  });

  return { projectId, skipped: false as const, report };
}

async function main() {
  if (process.env.DATABASE_URL?.match(/tripnara_prod|production/i)) {
    console.error('Refusing production DATABASE_URL');
    process.exit(1);
  }

  const projects = await prisma.gate1Project.findMany({
    where: { linkedTripId: { not: null } },
    select: { id: true },
  });

  if (projects.length === 0) {
    console.log('gate1-runtime-reconcile-check: no linked projects — OK');
    return;
  }

  let mismatches = 0;
  for (const p of projects) {
    const result = await reconcileOne(p.id);
    if (result.skipped) continue;
    if (!result.report.allMatched) {
      mismatches++;
      console.error(`MISMATCH ${result.report.projectTitle} (${p.id})`);
      for (const e of result.report.entities) {
        if (!e.matched) {
          console.error(`  ${e.entity}: missing=${e.missingInEvents.join(',')} extra=${e.extraInEvents.join(',')}`);
        }
      }
    }
  }

  if (mismatches > 0) {
    console.error(`gate1-runtime-reconcile-check: ${mismatches} project(s) failed`);
    process.exit(1);
  }

  console.log(`gate1-runtime-reconcile-check: ${projects.length} linked project(s) OK`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
