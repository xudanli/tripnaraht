/**
 * PRD 3.13 — 持久化拼团 decisionBrief 预测 vs 行后 Replay 观测，供 offline replay / CI gate。
 * 启用：COLLAB_FLYWHEEL_AUDIT=1
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ActiveTripDecisionReplayView } from '../types/active-trip-decision-replay.types';
import type { ActiveTripFlywheelAuditReportView } from '../types/active-trip-decision-replay.types';
import type { PreMatchDecisionBriefView } from '../types/recruitment-task-flywheel.types';
import { readCollaborativeTaskFlywheelFromMetadata } from '../engine/collaborative-task-behavior.engine';
import {
  buildCollaborativeFlywheelObservationExport,
  buildCollaborativeFlywheelPredictionExport,
  compareCollaborativeFlywheelFingerprints,
  computeCollaborativeFlywheelObservationFingerprint,
  computeCollaborativeFlywheelPredictionFingerprint,
  computeReplayComparableObservationFingerprint,
  computeReplayComparablePredictionFingerprint,
} from './collaborative-flywheel-replay-audit.util';
import {
  COLLAB_FLYWHEEL_OUTCOME_SCHEMA,
  type CollabFlywheelOutcomePayloadV1,
  type CollabFlywheelReplayCompareResult,
} from './collaborative-flywheel-audit.types';
import { COLLAB_FLYWHEEL_AUDIT_SCHEMA } from './collaborative-flywheel-replay-audit.util';

@Injectable()
export class CollabFlywheelAuditService {
  private readonly logger = new Logger(CollabFlywheelAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  private enabled(): boolean {
    const v = String(
      process.env.COLLAB_FLYWHEEL_AUDIT ?? process.env.collab_flywheel_audit ?? '',
    )
      .trim()
      .toLowerCase();
    return v === '1' || v === 'true' || v === 'yes';
  }

  /** Append-only prediction row at application submit. Returns snapshot id or null. */
  async recordPrediction(params: {
    recruitmentPostId: string;
    applicationId: string;
    brief: PreMatchDecisionBriefView | null;
  }): Promise<string | null> {
    if (!this.enabled() || !params.brief) return null;

    try {
      const exportPayload = buildCollaborativeFlywheelPredictionExport(params.brief);
      const predictionFingerprint = computeCollaborativeFlywheelPredictionFingerprint(exportPayload);

      const row = await this.prisma.collabFlywheelAuditSnapshot.upsert({
        where: { applicationId: params.applicationId },
        create: {
          recruitmentPostId: params.recruitmentPostId,
          applicationId: params.applicationId,
          schemaVersion: COLLAB_FLYWHEEL_AUDIT_SCHEMA,
          predictionFingerprint,
          prediction: { ...exportPayload, brief: params.brief } as object,
        },
        update: {
          predictionFingerprint,
          prediction: { ...exportPayload, brief: params.brief } as object,
          capturedAt: new Date(),
        },
        select: { id: true },
      });

      return row.id;
    } catch (e) {
      this.logger.warn(
        `[CollabFlywheelAudit] recordPrediction failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /** 实例化后回填 tripId（按 approved 申请批量关联）。 */
  async linkTripToRecruitmentPost(recruitmentPostId: string, tripId: string): Promise<number> {
    if (!this.enabled()) return 0;

    try {
      const result = await this.prisma.collabFlywheelAuditSnapshot.updateMany({
        where: { recruitmentPostId, tripId: null },
        data: { tripId },
      });
      return result.count;
    } catch (e) {
      this.logger.warn(
        `[CollabFlywheelAudit] linkTrip failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return 0;
    }
  }

  /**
   * decision-replay API：解析/回填 outcome 并返回完整 auditReport（有 snapshot 时）。
   * persist=true（COLLAB_FLYWHEEL_AUDIT=1）时写入 DB；否则只读对撞。
   */
  async resolveFlywheelAuditReportForReplay(input: {
    tripId: string;
    replay: ActiveTripDecisionReplayView;
    metadata: unknown;
    source?: string;
  }): Promise<ActiveTripFlywheelAuditReportView | null> {
    const tripId = input.tripId.trim();
    if (!tripId) return null;

    try {
      const row = await this.prisma.collabFlywheelAuditSnapshot.findFirst({
        where: { tripId },
        orderBy: { capturedAt: 'desc' },
      });
      if (!row) return null;

      const flywheel = readCollaborativeTaskFlywheelFromMetadata(input.metadata);
      const dispatchedTemplateIds = flywheel?.tasks.map((t) => t.templateId) ?? [];
      const observation = buildCollaborativeFlywheelObservationExport({
        flywheelMetrics: input.replay.flywheelMetrics,
        timeline: input.replay.timeline,
      });

      const existingOutcome = row.outcome as unknown as CollabFlywheelOutcomePayloadV1 | null;
      if (existingOutcome?.audit && !this.enabled()) {
        return this.toAuditReportView(row, existingOutcome.audit, observation);
      }

      const brief = this.parseBriefFromPrediction(row.prediction);
      if (!brief) return null;

      const audit = compareCollaborativeFlywheelFingerprints({
        prediction: brief,
        observation,
        dispatchedMitigatingTemplateIds: dispatchedTemplateIds,
      });

      if (this.enabled() && existingOutcome == null) {
        const outcomePayload: CollabFlywheelOutcomePayloadV1 = {
          schema: COLLAB_FLYWHEEL_OUTCOME_SCHEMA,
          recordedAtIso: new Date().toISOString(),
          observation,
          audit,
          abuNarrative: input.replay.abuNarrative,
          dispatchedMitigatingTemplateIds: dispatchedTemplateIds,
        };

        await this.prisma.collabFlywheelAuditSnapshot.update({
          where: { id: row.id },
          data: {
            outcome: outcomePayload as object,
            outcomeFingerprint: computeCollaborativeFlywheelObservationFingerprint(observation),
            auditMatch: audit.match,
            outcomeRecordedAt: new Date(),
            outcomeSource: input.source ?? 'decision_replay',
            tripId,
          },
        });
      }

      return this.toAuditReportView(row, audit, observation);
    } catch (e) {
      this.logger.warn(
        `[CollabFlywheelAudit] resolveFlywheelAuditReport failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * @deprecated 使用 resolveFlywheelAuditReportForReplay
   */
  async tryRecordOutcomeFromReplay(input: {
    tripId: string;
    replay: ActiveTripDecisionReplayView;
    metadata: unknown;
    source?: string;
  }): Promise<CollabFlywheelReplayCompareResult | null> {
    const report = await this.resolveFlywheelAuditReportForReplay(input);
    if (!report) return null;
    return {
      snapshotId: report.snapshotId ?? '',
      applicationId: report.applicationId ?? '',
      tripId: report.tripId,
      predictionFingerprint: report.predictionFingerprint,
      comparablePredictionFp: report.comparablePredictionFp,
      comparableObservationFp: report.comparableObservationFp,
      auditMatch: report.match,
      note: report.note,
    };
  }

  /** Offline / CLI：对比已存 prediction 与 outcome.observation。 */
  async replayCompareSnapshot(snapshotId: string): Promise<CollabFlywheelReplayCompareResult | null> {
    const id = snapshotId.trim();
    if (!id) return null;

    try {
      const row = await this.prisma.collabFlywheelAuditSnapshot.findUnique({ where: { id } });
      if (!row) return null;

      const outcome = row.outcome as unknown as CollabFlywheelOutcomePayloadV1 | null;
      const observation =
        outcome?.observation ??
        (outcome ? null : null);

      if (!observation) {
        return {
          snapshotId: row.id,
          applicationId: row.applicationId,
          tripId: row.tripId,
          predictionFingerprint: row.predictionFingerprint,
          comparablePredictionFp: computeReplayComparablePredictionFingerprint(
            exportPayloadFromJson(row.prediction),
          ),
          comparableObservationFp: null,
          auditMatch: null,
          note: 'outcome not recorded yet',
        };
      }

      return this.buildCompareResult(row, observation);
    } catch (e) {
      this.logger.warn(
        `[CollabFlywheelAudit] replayCompare failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  async replayCompareByTrip(tripId: string): Promise<CollabFlywheelReplayCompareResult[]> {
    const rows = await this.prisma.collabFlywheelAuditSnapshot.findMany({
      where: { tripId: tripId.trim() },
      orderBy: { capturedAt: 'desc' },
    });

    const out: CollabFlywheelReplayCompareResult[] = [];
    for (const row of rows) {
      const cmp = await this.replayCompareSnapshot(row.id);
      if (cmp) out.push(cmp);
    }
    return out;
  }

  private buildCompareResult(
    row: {
      id: string;
      applicationId: string;
      tripId: string | null;
      predictionFingerprint: string;
      prediction: unknown;
      outcome: unknown;
      auditMatch: boolean | null;
    },
    observation: ReturnType<typeof buildCollaborativeFlywheelObservationExport>,
  ): CollabFlywheelReplayCompareResult {
    const outcome = row.outcome as unknown as CollabFlywheelOutcomePayloadV1 | null;
    return {
      snapshotId: row.id,
      applicationId: row.applicationId,
      tripId: row.tripId,
      predictionFingerprint: row.predictionFingerprint,
      comparablePredictionFp: computeReplayComparablePredictionFingerprint(
        exportPayloadFromJson(row.prediction),
      ),
      comparableObservationFp: computeReplayComparableObservationFingerprint(observation),
      auditMatch: outcome?.audit.match ?? row.auditMatch,
    };
  }

  private toAuditReportView(
    row: {
      id: string;
      applicationId: string;
      tripId: string | null;
      predictionFingerprint: string;
      prediction: unknown;
      outcomeFingerprint: string | null;
    },
    audit: import('./collaborative-flywheel-replay-audit.util').CollaborativeFlywheelAuditReport,
    observation: ReturnType<typeof buildCollaborativeFlywheelObservationExport>,
  ): ActiveTripFlywheelAuditReportView {
    return {
      ...audit,
      snapshotId: row.id,
      applicationId: row.applicationId,
      tripId: row.tripId,
      predictionFingerprint: row.predictionFingerprint,
      observationFingerprint:
        row.outcomeFingerprint ??
        computeCollaborativeFlywheelObservationFingerprint(observation),
      comparablePredictionFp: computeReplayComparablePredictionFingerprint(
        exportPayloadFromJson(row.prediction),
      ),
      comparableObservationFp: computeReplayComparableObservationFingerprint(observation),
    };
  }

  private parseBriefFromPrediction(predictionJson: unknown): PreMatchDecisionBriefView | null {
    if (!predictionJson || typeof predictionJson !== 'object') return null;
    const p = predictionJson as Record<string, unknown>;
    if (p.brief && typeof p.brief === 'object') {
      return p.brief as PreMatchDecisionBriefView;
    }
    if (typeof p.inTripCollaborationNoisePercent !== 'number') return null;
    return {
      version: 'pre_match_decision_v1',
      hardMetricsPass: true,
      inTripCollaborationNoisePercent: p.inTripCollaborationNoisePercent,
      noiseDrivers: Array.isArray(p.noiseDriverIds)
        ? (p.noiseDriverIds as string[]).map((id) => ({
            factorId: id,
            label: id,
            weight: 0,
          }))
        : [],
      suggestedSceneRoleAnchor:
        (p.suggestedSceneRoleAnchor as PreMatchDecisionBriefView['suggestedSceneRoleAnchor']) ??
        null,
      suggestedSceneRoleLabel: null,
      mitigatingTaskTemplateIds: Array.isArray(p.mitigatingTaskTemplateIds)
        ? (p.mitigatingTaskTemplateIds as string[])
        : [],
      narrativeLine: null,
    };
  }
}

function exportPayloadFromJson(json: unknown) {
  const p = (json ?? {}) as Record<string, unknown>;
  return {
    schema: 'collab-flywheel-prediction/v1' as const,
    capturedAtIso: String(p.capturedAtIso ?? ''),
    inTripCollaborationNoisePercent: Number(p.inTripCollaborationNoisePercent ?? 0),
    suggestedSceneRoleAnchor:
      (p.suggestedSceneRoleAnchor as PreMatchDecisionBriefView['suggestedSceneRoleAnchor']) ?? null,
    mitigatingTaskTemplateIds: Array.isArray(p.mitigatingTaskTemplateIds)
      ? (p.mitigatingTaskTemplateIds as string[])
      : [],
    noiseDriverIds: Array.isArray(p.noiseDriverIds) ? (p.noiseDriverIds as string[]) : [],
  };
}
