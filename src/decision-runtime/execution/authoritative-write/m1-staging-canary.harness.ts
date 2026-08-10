/**
 * M1 Staging Canary — evidence packet + Apply-layer case runners.
 *
 * Full HTTP+LB PASS requires: shared non-prod PG, Redis, ≥2 instances, durable UWC sessions.
 * Embedded/dual-Prisma runs are REHEARSAL only (not PRODUCTION CANARY READY).
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toInputJsonValue } from '../../../trips/budget-os/utils/prisma-json.util';
import {
  cleanupConfirmLiveFixture,
  createConfirmLivePrisma,
  seedConfirmLiveFixture,
  assertConfirmMultiInstanceLiveAllowed,
} from './confirm-multi-instance-live.harness';
import { executeItineraryAdjustAuthoritativeCanary } from './itinerary-adjust-canary.executor';

export type M1EvidencePacket = {
  caseId: string;
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING';
  passed: boolean;
  requestId: string;
  confirmId: string;
  traceId: string;
  hitInstances: string[];
  dbLockObservation: string;
  idempotencyRecord: Record<string, unknown>;
  applyCount: number;
  planVersionCount: number;
  tripRevisionBefore: number;
  tripRevisionAfter: number;
  finalDbState: Record<string, unknown>;
  clientResponses: Array<Record<string, unknown>>;
  faultRecoveryResult: string;
  notes?: string;
  recordedAt: string;
};

export type M1CaseResult = {
  caseId: string;
  passed: boolean;
  packet: M1EvidencePacket;
  message: string;
};

function refuseProdUrl(url: string): void {
  if (/tripnara_prod|\/production/i.test(url)) {
    throw new Error('M1 refuses production DATABASE_URL');
  }
}

export function resolveM1DatabaseUrl(): string {
  const url =
    process.env.M1_STAGING_DATABASE_URL?.trim() ||
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL?.trim() ||
    '';
  if (!url) {
    throw new Error(
      'M1 needs M1_STAGING_DATABASE_URL (or CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL)',
    );
  }
  refuseProdUrl(url);
  return url;
}

export function isM1StagingTopologyConfigured(): {
  ok: boolean;
  gaps: string[];
} {
  const gaps: string[] = [];
  const local =
    String(process.env.M1_TOPOLOGY ?? '').trim().toLowerCase() === 'local';
  const db =
    process.env.M1_STAGING_DATABASE_URL?.trim() ||
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL?.trim() ||
    '';
  if (!db) gaps.push('M1_STAGING_DATABASE_URL missing');
  else if (/tripnara_prod|\/production/i.test(db)) {
    gaps.push('database URL looks like production — refused');
  }
  if (!process.env.REDIS_URL?.trim() && !process.env.REDIS_HOST?.trim()) {
    const localSkip =
      String(process.env.M1_TOPOLOGY ?? '').trim().toLowerCase() === 'local' &&
      String(process.env.M1_LOCAL_SKIP_REDIS ?? '').trim() === '1';
    if (!localSkip) gaps.push('REDIS_URL / REDIS_HOST missing');
  }
  if (String(process.env.UWC_1E_SESSION_REDIS ?? '').trim() !== '1') {
    const localSkip =
      String(process.env.M1_TOPOLOGY ?? '').trim().toLowerCase() === 'local' &&
      String(process.env.M1_LOCAL_SKIP_REDIS ?? '').trim() === '1';
    if (!localSkip) {
      gaps.push('UWC_1E_SESSION_REDIS!=1 (Confirm draft not shared across instances)');
    }
  }
  const a = process.env.M1_INSTANCE_A_BASE_URL?.trim();
  const b = process.env.M1_INSTANCE_B_BASE_URL?.trim();
  const lb = process.env.M1_LB_BASE_URL?.trim();
  if (!lb && (!a || !b)) {
    gaps.push('need M1_LB_BASE_URL or M1_INSTANCE_A_BASE_URL + M1_INSTANCE_B_BASE_URL');
  }
  if (local && db && !/127\.0\.0\.1|localhost/i.test(db)) {
    gaps.push('M1_TOPOLOGY=local expects localhost/127.0.0.1 database URL');
  }
  return { ok: gaps.length === 0, gaps };
}

async function readMeta(
  prisma: PrismaClient,
  tripId: string,
): Promise<{ revision: number; idem: Record<string, unknown> }> {
  const trip = await prisma.trip.findUnique({
    where: { id: tripId },
    select: { metadata: true },
  });
  const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
  const revision = Number(meta.revision ?? 0);
  const idem =
    meta.uwcItineraryCanaryIdem && typeof meta.uwcItineraryCanaryIdem === 'object'
      ? ({ ...(meta.uwcItineraryCanaryIdem as Record<string, unknown>) } as Record<
          string,
          unknown
        >)
      : {};
  return { revision, idem };
}

function packetBase(
  caseId: string,
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING',
  partial: Omit<
    M1EvidencePacket,
    'caseId' | 'mode' | 'recordedAt' | 'planVersionCount'
  > & { planVersionCount?: number },
): M1EvidencePacket {
  return {
    caseId,
    mode,
    recordedAt: new Date().toISOString(),
    planVersionCount: partial.planVersionCount ?? 0,
    ...partial,
  };
}

/** M1-01 / M1-06 Apply-layer: concurrent same idem key across two Prisma clients. */
export async function runM101ConcurrentSameKey(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING',
  instanceLabels: [string, string] = ['prisma-A', 'prisma-B'],
): Promise<M1CaseResult> {
  const caseId = 'M1-01';
  const fixture = await seedConfirmLiveFixture(prismaA);
  const requestId = `m1-01-req-${randomUUID()}`;
  const confirmId = `m1-01-cfm-${randomUUID()}`;
  const traceId = `m1-01-trc-${randomUUID()}`;
  const idempotencyKey = `m1-01-${confirmId}`;
  const nextStart = '2026-07-24T10:00:00.000Z';
  const nextEnd = '2026-07-24T11:00:00.000Z';
  const before = await readMeta(prismaA, fixture.tripId);

  try {
    const [a, b] = await Promise.all([
      executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaA,
        tripId: fixture.tripId,
        idempotencyKey,
        expectedTripRevision: fixture.revision,
        timeUpdates: [
          { itemId: fixture.itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
        ],
      }),
      executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaB,
        tripId: fixture.tripId,
        idempotencyKey,
        expectedTripRevision: fixture.revision,
        timeUpdates: [
          { itemId: fixture.itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
        ],
      }),
    ]);

    const after = await readMeta(prismaB, fixture.tripId);
    const applied = [a, b].filter((r) => r.outcome === 'APPLIED').length;
    const passed =
      applied === 1 &&
      after.idem[idempotencyKey] === 'APPLIED' &&
      after.revision === before.revision + 1;

    const packet = packetBase(caseId, mode, {
      passed,
      requestId,
      confirmId,
      traceId,
      hitInstances: [...instanceLabels],
      dbLockObservation: 'Trip FOR UPDATE serialize concurrent Apply',
      idempotencyRecord: { key: idempotencyKey, value: after.idem[idempotencyKey] },
      applyCount: applied,
      tripRevisionBefore: before.revision,
      tripRevisionAfter: after.revision,
      finalDbState: { revision: after.revision, idem: after.idem },
      clientResponses: [
        { instance: instanceLabels[0], outcome: a.outcome },
        { instance: instanceLabels[1], outcome: b.outcome },
      ],
      faultRecoveryResult: 'n/a',
      notes: 'Apply-layer dual Prisma; HTTP LB instance ids require Staging topology',
    });

    return {
      caseId,
      passed,
      packet,
      message: passed
        ? `applied=${applied} revision ${before.revision}→${after.revision}`
        : `FAIL applied=${applied} a=${a.outcome} b=${b.outcome}`,
    };
  } finally {
    await cleanupConfirmLiveFixture(prismaA);
  }
}

/** M1-02: crash after lock before commit, then retry succeeds once. */
export async function runM102CrashAfterLock(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING',
): Promise<M1CaseResult> {
  const caseId = 'M1-02';
  const fixture = await seedConfirmLiveFixture(prismaA);
  const requestId = `m1-02-req-${randomUUID()}`;
  const confirmId = `m1-02-cfm-${randomUUID()}`;
  const traceId = `m1-02-trc-${randomUUID()}`;
  const idempotencyKey = `m1-02-${confirmId}`;
  const nextStart = '2026-07-24T11:00:00.000Z';
  const nextEnd = '2026-07-24T12:00:00.000Z';
  const before = await readMeta(prismaA, fixture.tripId);

  const prevCrash = process.env.UWC_M1_CRASH_AFTER_LOCK;
  const prevKey = process.env.UWC_M1_CRASH_IDEMPOTENCY_KEY;
  process.env.UWC_M1_CRASH_AFTER_LOCK = '1';
  process.env.UWC_M1_CRASH_IDEMPOTENCY_KEY = idempotencyKey;

  let crashErr: string | null = null;
  try {
    try {
      await executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaA,
        tripId: fixture.tripId,
        idempotencyKey,
        expectedTripRevision: fixture.revision,
        timeUpdates: [
          { itemId: fixture.itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
        ],
      });
    } catch (e) {
      crashErr = e instanceof Error ? e.message : String(e);
    }

    delete process.env.UWC_M1_CRASH_AFTER_LOCK;
    delete process.env.UWC_M1_CRASH_IDEMPOTENCY_KEY;

    const mid = await readMeta(prismaA, fixture.tripId);
    const second = await executeItineraryAdjustAuthoritativeCanary({
      prisma: prismaB,
      tripId: fixture.tripId,
      idempotencyKey,
      expectedTripRevision: fixture.revision,
      timeUpdates: [
        { itemId: fixture.itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
      ],
    });
    const after = await readMeta(prismaB, fixture.tripId);

    const passed =
      Boolean(crashErr?.includes('M1_CRASH_AFTER_LOCK')) &&
      mid.revision === before.revision &&
      mid.idem[idempotencyKey] !== 'APPLIED' &&
      second.outcome === 'APPLIED' &&
      after.revision === before.revision + 1 &&
      after.idem[idempotencyKey] === 'APPLIED';

    const packet = packetBase(caseId, mode, {
      passed,
      requestId,
      confirmId,
      traceId,
      hitInstances: ['prisma-A-crash', 'prisma-B-retry'],
      dbLockObservation: 'lock taken then txn abort via M1_CRASH_AFTER_LOCK; retry commits',
      idempotencyRecord: { key: idempotencyKey, value: after.idem[idempotencyKey] },
      applyCount: second.outcome === 'APPLIED' ? 1 : 0,
      tripRevisionBefore: before.revision,
      tripRevisionAfter: after.revision,
      finalDbState: { midRevision: mid.revision, after },
      clientResponses: [
        { instance: 'A', error: crashErr },
        { instance: 'B', outcome: second.outcome },
      ],
      faultRecoveryResult: passed
        ? 'abort left zero durable write; retry APPLIED once'
        : 'recovery failed',
      notes: 'Rehearsal uses throw-abort; Staging kill uses process terminate after lock',
    });

    return {
      caseId,
      passed,
      packet,
      message: passed ? 'crash-abort then single APPLIED' : `FAIL crash=${crashErr} second=${second.outcome}`,
    };
  } finally {
    if (prevCrash === undefined) delete process.env.UWC_M1_CRASH_AFTER_LOCK;
    else process.env.UWC_M1_CRASH_AFTER_LOCK = prevCrash;
    if (prevKey === undefined) delete process.env.UWC_M1_CRASH_IDEMPOTENCY_KEY;
    else process.env.UWC_M1_CRASH_IDEMPOTENCY_KEY = prevKey;
    await cleanupConfirmLiveFixture(prismaA);
  }
}

/** M1-03: Apply success then client retries same key (lost response). */
export async function runM103LostResponseRetry(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING',
): Promise<M1CaseResult> {
  const caseId = 'M1-03';
  const fixture = await seedConfirmLiveFixture(prismaA);
  const requestId = `m1-03-req-${randomUUID()}`;
  const confirmId = `m1-03-cfm-${randomUUID()}`;
  const traceId = `m1-03-trc-${randomUUID()}`;
  const idempotencyKey = `m1-03-${confirmId}`;
  const nextStart = '2026-07-24T12:00:00.000Z';
  const nextEnd = '2026-07-24T13:00:00.000Z';
  const before = await readMeta(prismaA, fixture.tripId);

  try {
    const first = await executeItineraryAdjustAuthoritativeCanary({
      prisma: prismaA,
      tripId: fixture.tripId,
      idempotencyKey,
      expectedTripRevision: fixture.revision,
      timeUpdates: [
        { itemId: fixture.itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
      ],
    });
    // Client "lost" response — retries with same key against other instance.
    const retry = await executeItineraryAdjustAuthoritativeCanary({
      prisma: prismaB,
      tripId: fixture.tripId,
      idempotencyKey,
      expectedTripRevision: fixture.revision + 1,
      timeUpdates: [
        { itemId: fixture.itemId, startTimeIso: nextStart, endTimeIso: nextEnd },
      ],
    });
    const after = await readMeta(prismaB, fixture.tripId);
    const passed =
      first.outcome === 'APPLIED' &&
      retry.outcome === 'IDEMPOTENT_REPLAY' &&
      after.revision === before.revision + 1;

    const packet = packetBase(caseId, mode, {
      passed,
      requestId,
      confirmId,
      traceId,
      hitInstances: ['prisma-A', 'prisma-B'],
      dbLockObservation: 'second attempt reads durable idem under FOR UPDATE',
      idempotencyRecord: { key: idempotencyKey, value: after.idem[idempotencyKey] },
      applyCount: 1,
      tripRevisionBefore: before.revision,
      tripRevisionAfter: after.revision,
      finalDbState: after,
      clientResponses: [
        { attempt: 1, outcome: first.outcome, clientSaw: 'timeout/lost' },
        { attempt: 2, outcome: retry.outcome },
      ],
      faultRecoveryResult: passed ? 'retry IDEMPOTENT_REPLAY; no second mutate' : 'FAIL',
    });

    return {
      caseId,
      passed,
      packet,
      message: passed ? 'APPLIED then IDEMPOTENT_REPLAY' : `FAIL ${first.outcome}/${retry.outcome}`,
    };
  } finally {
    await cleanupConfirmLiveFixture(prismaA);
  }
}

/** M1-04: Preview revision stale after concurrent bump. */
export async function runM104StaleRevision(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING',
): Promise<M1CaseResult> {
  const caseId = 'M1-04';
  const fixture = await seedConfirmLiveFixture(prismaA);
  const requestId = `m1-04-req-${randomUUID()}`;
  const confirmId = `m1-04-cfm-${randomUUID()}`;
  const traceId = `m1-04-trc-${randomUUID()}`;
  const idempotencyKey = `m1-04-${confirmId}`;
  const before = await readMeta(prismaA, fixture.tripId);

  try {
    // Another writer bumps revision (simulates PlanVersion / other Apply).
    await prismaB.trip.update({
      where: { id: fixture.tripId },
      data: {
        metadata: toInputJsonValue({
          revision: fixture.revision + 1,
          uwcItineraryCanaryIdem: {},
        }),
        updatedAt: new Date(),
      },
    });

    const stale = await executeItineraryAdjustAuthoritativeCanary({
      prisma: prismaA,
      tripId: fixture.tripId,
      idempotencyKey,
      expectedTripRevision: fixture.revision,
      timeUpdates: [
        {
          itemId: fixture.itemId,
          startTimeIso: '2026-07-24T14:00:00.000Z',
          endTimeIso: '2026-07-24T15:00:00.000Z',
        },
      ],
    });
    const after = await readMeta(prismaA, fixture.tripId);
    const passed =
      stale.outcome === 'CONFLICT' &&
      after.revision === fixture.revision + 1 &&
      after.idem[idempotencyKey] !== 'APPLIED';

    const packet = packetBase(caseId, mode, {
      passed,
      requestId,
      confirmId,
      traceId,
      hitInstances: ['prisma-A'],
      dbLockObservation: 'OCC RESOURCE_VERSION_SET rejects stale expectedTripRevision',
      idempotencyRecord: { key: idempotencyKey, value: after.idem[idempotencyKey] ?? null },
      applyCount: 0,
      tripRevisionBefore: before.revision,
      tripRevisionAfter: after.revision,
      finalDbState: after,
      clientResponses: [{ outcome: stale.outcome, mustRePreview: true }],
      faultRecoveryResult: passed ? 'stale Confirm wrote nothing' : 'FAIL',
    });

    return {
      caseId,
      passed,
      packet,
      message: passed ? 'CONFLICT on stale revision' : `FAIL ${stale.outcome}`,
    };
  } finally {
    await cleanupConfirmLiveFixture(prismaA);
  }
}

/** M1-05: two Confirms (different keys) mutate same item concurrently. */
export async function runM105SameItemTwoConfirms(
  prismaA: PrismaClient,
  prismaB: PrismaClient,
  mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING',
): Promise<M1CaseResult> {
  const caseId = 'M1-05';
  const fixture = await seedConfirmLiveFixture(prismaA);
  const requestId = `m1-05-req-${randomUUID()}`;
  const confirmIdA = `m1-05-cfm-a-${randomUUID()}`;
  const confirmIdB = `m1-05-cfm-b-${randomUUID()}`;
  const traceId = `m1-05-trc-${randomUUID()}`;
  const before = await readMeta(prismaA, fixture.tripId);

  try {
    const [a, b] = await Promise.all([
      executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaA,
        tripId: fixture.tripId,
        idempotencyKey: `m1-05-${confirmIdA}`,
        expectedTripRevision: fixture.revision,
        timeUpdates: [
          {
            itemId: fixture.itemId,
            startTimeIso: '2026-07-24T15:00:00.000Z',
            endTimeIso: '2026-07-24T16:00:00.000Z',
          },
        ],
      }),
      executeItineraryAdjustAuthoritativeCanary({
        prisma: prismaB,
        tripId: fixture.tripId,
        idempotencyKey: `m1-05-${confirmIdB}`,
        expectedTripRevision: fixture.revision,
        timeUpdates: [
          {
            itemId: fixture.itemId,
            startTimeIso: '2026-07-24T16:00:00.000Z',
            endTimeIso: '2026-07-24T17:00:00.000Z',
          },
        ],
      }),
    ]);

    const after = await readMeta(prismaA, fixture.tripId);
    const applied = [a, b].filter((r) => r.outcome === 'APPLIED').length;
    const conflictOrReplay = [a, b].filter(
      (r) => r.outcome === 'CONFLICT' || r.outcome === 'IDEMPOTENT_REPLAY',
    ).length;
    const passed =
      applied === 1 &&
      conflictOrReplay === 1 &&
      after.revision === before.revision + 1;

    const packet = packetBase(caseId, mode, {
      passed,
      requestId,
      confirmId: `${confirmIdA}|${confirmIdB}`,
      traceId,
      hitInstances: ['prisma-A', 'prisma-B'],
      dbLockObservation: 'FOR UPDATE + OCC → one APPLIED, one CONFLICT',
      idempotencyRecord: after.idem,
      applyCount: applied,
      tripRevisionBefore: before.revision,
      tripRevisionAfter: after.revision,
      finalDbState: after,
      clientResponses: [
        { confirmId: confirmIdA, outcome: a.outcome },
        { confirmId: confirmIdB, outcome: b.outcome },
      ],
      faultRecoveryResult: passed ? 'single winner; DB consistent' : 'FAIL',
    });

    return {
      caseId,
      passed,
      packet,
      message: passed
        ? `winner applied=${applied}`
        : `FAIL a=${a.outcome} b=${b.outcome}`,
    };
  } finally {
    await cleanupConfirmLiveFixture(prismaA);
  }
}

export function writeM1EvidencePacket(
  packet: M1EvidencePacket,
  outDir = join(
    process.cwd(),
    'evidence/work-packages/AGENT-HARNESS-P0/m1-cases',
  ),
): string {
  mkdirSync(outDir, { recursive: true });
  const day = packet.recordedAt.slice(0, 10).replace(/-/g, '');
  const path = join(outDir, `${packet.caseId}-${day}-${packet.mode.toLowerCase()}.md`);
  const body = `# ${packet.caseId} — ${packet.mode}

**passed:** ${packet.passed}  
**recordedAt:** ${packet.recordedAt}

| Field | Value |
|-------|-------|
| requestId | \`${packet.requestId}\` |
| confirmId | \`${packet.confirmId}\` |
| traceId | \`${packet.traceId}\` |
| hitInstances | ${packet.hitInstances.join(', ')} |
| dbLockObservation | ${packet.dbLockObservation} |
| applyCount | ${packet.applyCount} |
| planVersionCount | ${packet.planVersionCount} |
| tripRevision | ${packet.tripRevisionBefore} → ${packet.tripRevisionAfter} |
| faultRecoveryResult | ${packet.faultRecoveryResult} |

## Idempotency

\`\`\`json
${JSON.stringify(packet.idempotencyRecord, null, 2)}
\`\`\`

## Client responses

\`\`\`json
${JSON.stringify(packet.clientResponses, null, 2)}
\`\`\`

## Final DB state

\`\`\`json
${JSON.stringify(packet.finalDbState, null, 2)}
\`\`\`

${packet.notes ? `## Notes\n\n${packet.notes}\n` : ''}
`;
  writeFileSync(path, body, 'utf8');
  return path;
}

export async function runM1ApplyLayerSuite(mode: 'REHEARSAL' | 'STAGING' | 'LOCAL_STAGING'): Promise<{
  results: M1CaseResult[];
  allPassed: boolean;
  paths: string[];
}> {
  if (mode === 'STAGING') {
    process.env.CONFIRM_MULTI_INSTANCE_LIVE = '1';
    process.env.CONFIRM_MULTI_INSTANCE_LIVE_DATABASE_URL = resolveM1DatabaseUrl();
    assertConfirmMultiInstanceLiveAllowed();
  }

  const prismaA = createConfirmLivePrisma();
  const prismaB = createConfirmLivePrisma();
  const paths: string[] = [];
  const results: M1CaseResult[] = [];

  try {
    await prismaA.$connect();
    await prismaB.$connect();

    for (const run of [
      () => runM101ConcurrentSameKey(prismaA, prismaB, mode),
      () => runM102CrashAfterLock(prismaA, prismaB, mode),
      () => runM103LostResponseRetry(prismaA, prismaB, mode),
      () => runM104StaleRevision(prismaA, prismaB, mode),
      () => runM105SameItemTwoConfirms(prismaA, prismaB, mode),
    ]) {
      const r = await run();
      results.push(r);
      paths.push(writeM1EvidencePacket(r.packet));
    }
  } finally {
    await prismaA.$disconnect().catch(() => undefined);
    await prismaB.$disconnect().catch(() => undefined);
  }

  return {
    results,
    allPassed: results.every((r) => r.passed),
    paths,
  };
}
