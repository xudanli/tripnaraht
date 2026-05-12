/**
 * Offline replay job: compare replay-comparable fingerprints (legs + weather + planDigest)
 * between stored `prediction` JSON and `outcome.extensions.observation_export`.
 *
 * Usage:
 *   npx tsx scripts/ops-reality-replay-compare.ts --snapshot=<uuid>
 *   npx tsx scripts/ops-reality-replay-compare.ts --trip=<tripId> [--limit=20]
 *
 * Requires DATABASE_URL and `ops_reality_audit_snapshots` rows (OPS_REALITY_AUDIT historically).
 */

import { PrismaClient } from '@prisma/client';
import {
  compareReplayFingerprints,
  computeReplayComparableFingerprintFromPredictionJson,
  parseObservationExportFromOutcomeExtensions,
} from '../src/trips/decision/observability/ops-reality-audit-payload';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p?.split('=').slice(1).join('=')?.trim() || undefined;
}

async function main(): Promise<void> {
  const snapshotId = arg('snapshot');
  const tripId = arg('trip');
  const limit = Math.min(100, Math.max(1, parseInt(arg('limit') ?? '20', 10) || 20));

  if (!snapshotId && !tripId) {
    console.error('Usage: --snapshot=<uuid> | --trip=<tripId> [--limit=20]');
    process.exit(2);
  }

  const rows = snapshotId
    ? await prisma.opsRealityAuditSnapshot.findMany({
        where: { id: snapshotId },
        select: { id: true, predictionFingerprint: true, prediction: true, outcome: true },
      })
    : await prisma.opsRealityAuditSnapshot.findMany({
        where: { tripId: tripId! },
        orderBy: { capturedAt: 'desc' },
        take: limit,
        select: { id: true, predictionFingerprint: true, prediction: true, outcome: true },
      });

  const out: unknown[] = [];
  for (const row of rows) {
    const outcome = row.outcome as Record<string, unknown> | null;
    const ext = outcome?.extensions;
    const obs = parseObservationExportFromOutcomeExtensions(ext);
    const fpPred = computeReplayComparableFingerprintFromPredictionJson(row.prediction);
    if (fpPred == null) {
      out.push({
        snapshotId: row.id,
        predictionFingerprint: row.predictionFingerprint,
        match: null,
        note: 'prediction JSON missing legs/planDigest',
      });
      continue;
    }
    if (!obs) {
      out.push({
        snapshotId: row.id,
        predictionFingerprint: row.predictionFingerprint,
        comparablePredictionFp: fpPred,
        match: null,
        note: 'no outcome.extensions.observation_export',
      });
      continue;
    }
    try {
      const r = compareReplayFingerprints(row.prediction, obs);
      out.push({
        snapshotId: row.id,
        predictionFingerprint: row.predictionFingerprint,
        comparablePredictionFp: r.fpPredictionComparable,
        comparableObservationFp: r.fpObservationComparable,
        match: r.match,
      });
    } catch (e) {
      out.push({
        snapshotId: row.id,
        predictionFingerprint: row.predictionFingerprint,
        match: null,
        note: e instanceof Error ? e.message : String(e),
      });
    }
  }

  console.log(JSON.stringify(out, null, 2));
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
