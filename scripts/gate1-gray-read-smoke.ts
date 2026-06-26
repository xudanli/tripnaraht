/**
 * M3 gray-read smoke: verify DecisionWorkspaceReadService returns valid bundle.
 * Uses Prisma directly — no full Nest bootstrap.
 *
 * Usage:
 *   DECISION_RUNTIME_READ_FROM_PROJECTION=true npm run gate1:gray-read-smoke
 *   npm run gate1:gray-read-smoke -- --project-id=<uuid>
 *   npm run gate1:gray-read-smoke -- --all
 */
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { DecisionWorkspaceReadService } from '../src/decision-runtime/services/decision-workspace-read.service';
import { DecisionWorkspaceReconciliationService } from '../src/decision-runtime/services/decision-workspace-reconciliation.service';

loadEnv({ path: path.resolve(__dirname, '..', '.env') });

async function smokeProject(
  read: DecisionWorkspaceReadService,
  projectId: string,
  title: string,
) {
  const workspace = await read.getWorkspace(projectId);
  const timeline = await read.getAuditTimeline(projectId);

  const checks = {
    hasMeta: !!workspace.meta,
    projectionEnabled: workspace.meta.projectionEnabled,
    readSource: workspace.meta.readModelSource,
    reconciliationMatched: workspace.meta.reconciliationMatched,
    auditEntries: timeline.entries.length,
    warnings: workspace.meta.validationWarnings.length,
    hasTripId: !!workspace.meta.tripId,
  };

  const ok =
    checks.hasTripId &&
    checks.projectionEnabled &&
    checks.reconciliationMatched === true &&
    checks.readSource === 'projection_hybrid';

  return { projectId, title, ok, checks, meta: workspace.meta };
}

async function main() {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  let projectId = args.find((a) => a.startsWith('--project-id='))?.split('=')[1];

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  if (!process.env.DECISION_RUNTIME_READ_FROM_PROJECTION) {
    process.env.DECISION_RUNTIME_READ_FROM_PROJECTION = 'true';
  }
  if (!process.env.RUNTIME_REPLAY_VALIDATION) {
    process.env.RUNTIME_REPLAY_VALIDATION = 'true';
  }

  const prisma = new PrismaClient();
  const reconciliation = new DecisionWorkspaceReconciliationService(prisma as never);
  const read = new DecisionWorkspaceReadService(prisma as never, reconciliation);

  try {
    const targets = all
      ? await prisma.gate1Project.findMany({
          where: { linkedTripId: { not: null } },
          select: { id: true, title: true },
          orderBy: { updatedAt: 'desc' },
        })
      : [];

    if (all && targets.length === 0) {
      console.error('No linked Gate1 projects found');
      process.exit(1);
    }

    if (!all) {
      if (!projectId) {
        const project = await prisma.gate1Project.findFirst({
          where: { linkedTripId: { not: null } },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, title: true },
        });
        if (!project) {
          console.error('No linked Gate1 project found');
          process.exit(1);
        }
        targets.push(project);
      } else {
        const project = await prisma.gate1Project.findUnique({
          where: { id: projectId },
          select: { id: true, title: true },
        });
        if (!project) {
          console.error(`Project not found: ${projectId}`);
          process.exit(1);
        }
        targets.push(project);
      }
    }

    const results = [];
    for (const t of targets) {
      const result = await smokeProject(read, t.id, t.title);
      results.push(result);
      console.log(
        `${result.ok ? 'OK' : 'FAIL'}  ${t.title} (${t.id}) source=${result.checks.readSource} audit=${result.checks.auditEntries}`,
      );
    }

    console.log(JSON.stringify({ results }, null, 2));

    const failed = results.filter((r) => !r.ok);
    if (failed.length > 0) {
      console.error(`M3 gray-read smoke: ${failed.length}/${results.length} failed`);
      process.exit(1);
    }

    console.log(`M3 gray-read smoke: OK (${results.length} project(s))`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
