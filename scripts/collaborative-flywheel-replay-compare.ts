/**
 * Offline replay: compare Match Square 协同飞轮 prediction (decisionBrief) vs observation (decision-replay).
 *
 * Usage:
 *   npx tsx scripts/collaborative-flywheel-replay-compare.ts --application=<uuid>
 *   npx tsx scripts/collaborative-flywheel-replay-compare.ts --trip=<tripId>
 *
 * Requires DATABASE_URL; trip mode loads latest application on the recruitment post bound to the trip.
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildApplicationDecisionBrief } from '../src/match-square/util/recruitment-task-flywheel.util';
import { buildActiveTripDecisionReplayView } from '../src/match-square/engine/active-trip-decision-replay.engine';
import { readCollaborativeTaskFlywheelFromMetadata } from '../src/match-square/engine/collaborative-task-behavior.engine';
import { readTripInstantiationResultFromSnapshot } from '../src/match-square/engine/trip-instantiation.engine';
import type { CaptainPersonaSnapshot } from '../src/match-square/types/match-square.types';
import {
  buildCollaborativeFlywheelObservationExport,
  compareCollaborativeFlywheelFingerprints,
} from '../src/match-square/observability/collaborative-flywheel-replay-audit.util';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p?.split('=').slice(1).join('=')?.trim() || undefined;
}

async function listCrewUserIds(tripId: string): Promise<string[]> {
  const rows = await prisma.tripCollaborator.findMany({
    where: { tripId },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

async function main(): Promise<void> {
  const applicationId = arg('application');
  const tripIdArg = arg('trip');

  if (!applicationId && !tripIdArg) {
    console.error('Usage: --application=<uuid> | --trip=<tripId>');
    process.exit(2);
  }

  let tripId = tripIdArg ?? '';
  let application = applicationId
    ? await prisma.matchSquareRecruitmentApplication.findUnique({ where: { id: applicationId } })
    : null;

  if (application) {
    tripId = tripId || (await resolveTripIdFromPost(application.postId)) || '';
  } else if (tripIdArg) {
    application = await resolveApplicationFromTrip(tripIdArg);
  }

  if (!application) {
    console.error('Application not found');
    process.exit(1);
  }

  const post = await prisma.matchSquareRecruitmentPost.findUnique({
    where: { id: application.postId },
  });
  if (!post) {
    console.error('Post not found');
    process.exit(1);
  }

  if (!tripId) {
    tripId = (await resolveTripIdFromPost(application.postId)) ?? '';
  }
  if (!tripId) {
    console.error('Trip not instantiated for this recruitment post');
    process.exit(1);
  }

  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  if (!trip) {
    console.error('Trip not found');
    process.exit(1);
  }

  const brief = buildApplicationDecisionBrief({
    post,
    applicantSnapshot: application.applicantPersonaSnapshot as CaptainPersonaSnapshot | null,
    hardMetricsPass: true,
  });
  if (!brief) {
    console.error('Could not rebuild decisionBrief');
    process.exit(1);
  }

  const crewUserIds = await listCrewUserIds(tripId);
  const replay = buildActiveTripDecisionReplayView({
    tripId,
    metadata: trip.metadata,
    crewUserIds,
  });

  const flywheel = readCollaborativeTaskFlywheelFromMetadata(trip.metadata);
  const dispatchedTemplateIds = flywheel?.tasks.map((t) => t.templateId) ?? [];

  const observation = buildCollaborativeFlywheelObservationExport({
    flywheelMetrics: replay.flywheelMetrics,
    timeline: replay.timeline,
  });

  const report = compareCollaborativeFlywheelFingerprints({
    prediction: brief,
    observation,
    dispatchedMitigatingTemplateIds: dispatchedTemplateIds,
  });

  let dbCompare: unknown = null;
  const snapshot = await prisma.collabFlywheelAuditSnapshot.findFirst({
    where: tripIdArg ? { tripId: tripIdArg } : { applicationId: application!.id },
    orderBy: { capturedAt: 'desc' },
  });
  if (snapshot?.outcome) {
    dbCompare = {
      snapshotId: snapshot.id,
      predictionFingerprint: snapshot.predictionFingerprint,
      outcomeFingerprint: snapshot.outcomeFingerprint,
      auditMatch: snapshot.auditMatch,
    };
  }

  console.log(
    JSON.stringify(
      {
        applicationId: application.id,
        postId: application.postId,
        tripId,
        abuNarrative: replay.abuNarrative,
        audit: report,
        dbSnapshot: dbCompare,
      },
      null,
      2,
    ),
  );

  await prisma.$disconnect();
  process.exit(report.match ? 0 : 1);
}

async function resolveTripIdFromPost(postId: string): Promise<string | null> {
  const post = await prisma.matchSquareRecruitmentPost.findUnique({
    where: { id: postId },
    select: { captainPersonaSnapshot: true },
  });
  const result = readTripInstantiationResultFromSnapshot(post?.captainPersonaSnapshot);
  return result?.tripId ?? null;
}

async function resolveApplicationFromTrip(tripId: string) {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const meta = trip?.metadata as Record<string, unknown> | null;
  const inst = meta?.matchSquareInstantiation as { recruitmentPostId?: string } | undefined;
  const postId = inst?.recruitmentPostId;
  if (!postId) return null;

  return prisma.matchSquareRecruitmentApplication.findFirst({
    where: { postId, status: { in: ['approved', 'pending'] } },
    orderBy: { createdAt: 'desc' },
  });
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
