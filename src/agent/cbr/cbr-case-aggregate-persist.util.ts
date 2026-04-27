import type { PrismaClient } from '@prisma/client';
import type { CaseRecord } from './case-record.types';
import { caseQuerySignatureHash } from './case-signature-key.util';

function mergeEvidenceAnchorsForDb(
  prev: Array<{ evidence_id?: string; source?: string; note?: string }> | undefined,
  next: Array<{ evidence_id?: string; source?: string; note?: string }> | undefined,
): Array<{ evidence_id?: string; source?: string; note?: string }> | undefined {
  const out: Array<{ evidence_id?: string; source?: string; note?: string }> = [];
  const seen = new Set<string>();
  for (const e of prev ?? []) {
    const k = `${e.evidence_id ?? ''}|${e.source ?? ''}|${e.note ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  for (const e of next ?? []) {
    const k = `${e.evidence_id ?? ''}|${e.source ?? ''}|${e.note ?? ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
    if (out.length >= 5) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Delta 累加：与 LocalCaseStore.saveCase / export 脚本语义一致，写入 `cbr_case_aggregates`。
 * 供 CLI `--persist` 与运行时 CbrAggregatorService 共用。
 */
export async function upsertCbrCaseAggregateFromRecord(prisma: PrismaClient, record: CaseRecord): Promise<void> {
  const hash = caseQuerySignatureHash(record.query_signature);
  const sig = record.query_signature;
  const lateAccepted = (record.outcome_payload.historical_late_accept_rate ?? 1) > 0 ? 1 : 0;
  const lat = record.outcome_payload.wall_hit_distance_p90_latency_ms;
  const span = record.outcome_payload.wall_hit_distance_p90_event_span;
  const anchorsNew = record.outcome_payload.evidence_anchors ?? [];

  await prisma.$transaction(async (tx) => {
    const row = await tx.cbrCaseAggregate.findUnique({ where: { signatureHash: hash } });
    if (!row) {
      await tx.cbrCaseAggregate.create({
        data: {
          signatureHash: hash,
          conflictType: sig.conflict_type,
          primaryViolationType: sig.primary_violation_type ?? null,
          regionId: sig.region_id ?? null,
          month: sig.month ?? null,
          relaxationTypesJson: sig.relaxation_types ?? [],
          totalCount: 1,
          lateAcceptCount: lateAccepted,
          lateAcceptRate: lateAccepted > 0 ? 1 : 0,
          avgWallHitLatencyMs: typeof lat === 'number' ? lat : null,
          avgWallHitEventSpan: typeof span === 'number' ? span : null,
          evidenceAnchors: mergeEvidenceAnchorsForDb(undefined, anchorsNew) ?? [],
          precedentSummaryLatest: record.precedent_summary,
          lastCaseId: record.case_id,
          lastRequestId: record.provenance?.request_id ?? null,
        },
      });
      return;
    }

    const nextTotal = row.totalCount + 1;
    const nextLate = row.lateAcceptCount + lateAccepted;
    const nextAvgLat =
      typeof lat === 'number'
        ? typeof row.avgWallHitLatencyMs === 'number' && row.avgWallHitLatencyMs !== null
          ? (row.avgWallHitLatencyMs * row.totalCount + lat) / nextTotal
          : lat
        : row.avgWallHitLatencyMs;
    const nextAvgSpan =
      typeof span === 'number'
        ? typeof row.avgWallHitEventSpan === 'number' && row.avgWallHitEventSpan !== null
          ? (row.avgWallHitEventSpan * row.totalCount + span) / nextTotal
          : span
        : row.avgWallHitEventSpan;

    const prevAnchors = (row.evidenceAnchors as Array<{ evidence_id?: string; source?: string; note?: string }>) ?? [];

    await tx.cbrCaseAggregate.update({
      where: { signatureHash: hash },
      data: {
        totalCount: nextTotal,
        lateAcceptCount: nextLate,
        lateAcceptRate: nextLate / nextTotal,
        avgWallHitLatencyMs: nextAvgLat,
        avgWallHitEventSpan: nextAvgSpan,
        evidenceAnchors: mergeEvidenceAnchorsForDb(prevAnchors, anchorsNew) ?? [],
        precedentSummaryLatest: record.precedent_summary,
        lastCaseId: record.case_id,
        lastRequestId: record.provenance?.request_id ?? null,
      },
    });
  });
}
