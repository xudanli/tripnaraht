/**
 * P-OPS-2 — persist predicted overlay snapshot at decision time; optional outcome record for replay / drift analysis.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import type { TripPlan } from '../plan-model';
import type { WeatherEvidencePipelineResult } from '../interfaces/weather-decision-evidence.interface';
import {
  OPS_REALITY_AUDIT_SCHEMA,
  type OpsRealityOutcomePayloadV1,
  buildOpsRealityPredictionPayload,
  computePredictionFingerprint,
  compareReplayFingerprints,
  computeReplayComparableFingerprintFromPredictionJson,
  parseObservationExportFromOutcomeExtensions,
} from '../observability/ops-reality-audit-payload';

@Injectable()
export class OpsRealityAuditService {
  private readonly logger = new Logger(OpsRealityAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Persist only when OPS_REALITY_AUDIT=1 (avoid noisy failures before migration / local DB). */
  private enabled(): boolean {
    const v = String(process.env.OPS_REALITY_AUDIT ?? process.env.ops_reality_audit ?? '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  /**
   * Append-only prediction row. Returns snapshot id or null (never throws to callers).
   */
  async recordPrediction(params: {
    tripId?: string;
    requestId?: string;
    decisionRunId?: string;
    frames: ExecutionOverlayFrame[] | undefined;
    weatherPipeline: WeatherEvidencePipelineResult | undefined;
    plan: TripPlan;
  }): Promise<string | null> {
    if (!this.enabled()) {
      return null;
    }
    try {
      const capturedAtIso = new Date().toISOString();
      const prediction = buildOpsRealityPredictionPayload({
        capturedAtIso,
        frames: params.frames,
        weatherPipeline: params.weatherPipeline,
        plan: params.plan,
      });
      const predictionFingerprint = computePredictionFingerprint(prediction);

      const tripRaw = params.tripId?.trim();
      const tripId = tripRaw ? tripRaw.slice(0, 128) : undefined;

      const row = await this.prisma.opsRealityAuditSnapshot.create({
        data: {
          tripId,
          requestId: params.requestId?.slice(0, 120) ?? undefined,
          decisionRunId: params.decisionRunId?.slice(0, 80) ?? undefined,
          schemaVersion: OPS_REALITY_AUDIT_SCHEMA,
          predictionFingerprint,
          prediction: prediction as object,
        },
        select: { id: true },
      });
      return row.id;
    } catch (e) {
      this.logger.warn(
        `[P-OPS-2] recordPrediction failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * Backfill observed / actual execution (telemetry, user report, external trace).
   */
  async recordOutcome(
    snapshotId: string,
    outcome: OpsRealityOutcomePayloadV1,
    source?: string,
  ): Promise<boolean> {
    if (!this.enabled()) {
      return false;
    }
    const id = String(snapshotId ?? '').trim();
    if (!id) return false;
    try {
      const existing = await this.prisma.opsRealityAuditSnapshot.findUnique({
        where: { id },
        select: { id: true, outcome: true },
      });
      if (!existing || existing.outcome != null) {
        return false;
      }
      const now = new Date();
      await this.prisma.opsRealityAuditSnapshot.update({
        where: { id },
        data: {
          outcome: { ...outcome } as object,
          outcomeRecordedAt: now,
          outcomeSource: source?.slice(0, 40) ?? 'unspecified',
        },
      });
      return true;
    } catch (e) {
      this.logger.warn(
        `[P-OPS-2] recordOutcome failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }

  async listRecentForTrip(tripId: string, limit = 20): Promise<
    Array<{
      id: string;
      capturedAt: Date;
      predictionFingerprint: string;
      hasOutcome: boolean;
    }>
  > {
    const tid = String(tripId ?? '').trim();
    if (!tid) return [];
    try {
      const rows = await this.prisma.opsRealityAuditSnapshot.findMany({
        where: { tripId: tid },
        orderBy: { capturedAt: 'desc' },
        take: Math.min(100, Math.max(1, limit)),
        select: {
          id: true,
          capturedAt: true,
          predictionFingerprint: true,
          outcome: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        capturedAt: r.capturedAt,
        predictionFingerprint: r.predictionFingerprint,
        hasOutcome: r.outcome != null,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Compare stored prediction vs `outcome.extensions.observation_export` using replay-comparable fingerprints.
   */
  async replayCompareSnapshot(snapshotId: string): Promise<{
    snapshotId: string;
    predictionFingerprint: string;
    comparablePredictionFp: string;
    comparableObservationFp: string | null;
    match: boolean | null;
    note?: string;
  } | null> {
    if (!this.enabled()) {
      return null;
    }
    const id = String(snapshotId ?? '').trim();
    if (!id) return null;
    try {
      const row = await this.prisma.opsRealityAuditSnapshot.findUnique({
        where: { id },
        select: {
          id: true,
          predictionFingerprint: true,
          prediction: true,
          outcome: true,
        },
      });
      if (!row) return null;
      const outcome = row.outcome as Record<string, unknown> | null;
      const ext = outcome?.extensions;
      const obs = parseObservationExportFromOutcomeExtensions(ext);
      const fpPred = computeReplayComparableFingerprintFromPredictionJson(row.prediction);
      if (fpPred == null) {
        return {
          snapshotId: row.id,
          predictionFingerprint: row.predictionFingerprint,
          comparablePredictionFp: '',
          comparableObservationFp: null,
          match: null,
          note: 'prediction JSON missing legs/planDigest',
        };
      }
      if (!obs) {
        return {
          snapshotId: row.id,
          predictionFingerprint: row.predictionFingerprint,
          comparablePredictionFp: fpPred,
          comparableObservationFp: null,
          match: null,
          note: 'outcome.extensions.observation_export not set or invalid',
        };
      }
      try {
        const { match, fpPredictionComparable, fpObservationComparable } = compareReplayFingerprints(
          row.prediction,
          obs,
        );
        return {
          snapshotId: row.id,
          predictionFingerprint: row.predictionFingerprint,
          comparablePredictionFp: fpPredictionComparable,
          comparableObservationFp: fpObservationComparable,
          match,
        };
      } catch (e) {
        return {
          snapshotId: row.id,
          predictionFingerprint: row.predictionFingerprint,
          comparablePredictionFp: fpPred,
          comparableObservationFp: null,
          match: null,
          note: e instanceof Error ? e.message : String(e),
        };
      }
    } catch (e) {
      this.logger.warn(
        `[P-OPS-2] replayCompareSnapshot failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
