/**
 * Admin Decision Replay：从既有 TripRun 克隆上下文重跑 route_and_run，并与基线对比。
 * 不扩展 observability_v1 schema。
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentService } from './agent.service';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import {
  buildTripRunObservabilityV1,
  resolveTripRunObservabilityFromStored,
} from './trip-run-observability.util';
import { overlayFeedbackOntoObservability } from './trip-run-feedback.util';
import { compareDecisionObservability } from './agent-policy-optimization.util';

@Injectable()
export class AgentRunReplayAdminService {
  private readonly logger = new Logger(AgentRunReplayAdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly agentService?: AgentService,
  ) {}

  private isValidUUID(uuid: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      (uuid || '').trim(),
    );
  }

  /**
   * 重跑并对比。
   * - mode=reexecute：调用 route_and_run（需 AgentService）
   * - mode=compare_only：仅对比已有 targetRunId
   */
  async replayRun(
    sourceRunId: string,
    body?: {
      mode?: 'reexecute' | 'compare_only';
      compareToRunId?: string;
      messageOverride?: string;
      dryRun?: boolean;
    },
  ): Promise<Record<string, unknown> | null> {
    if (!this.isValidUUID(sourceRunId)) return null;
    const source = await this.prisma.tripRun.findUnique({
      where: { id: sourceRunId.trim() },
      select: {
        id: true,
        tripId: true,
        userId: true,
        userQuery: true,
        status: true,
        currentAgent: true,
        metadata: true,
      },
    });
    if (!source) return null;

    const meta = (source.metadata && typeof source.metadata === 'object'
      ? source.metadata
      : {}) as Record<string, any>;

    const beforeObs = overlayFeedbackOntoObservability(
      resolveTripRunObservabilityFromStored({
        metadata: meta,
        userQuery: source.userQuery,
        status: source.status,
      }),
      meta,
    );

    const mode = body?.mode ?? (body?.compareToRunId ? 'compare_only' : 'reexecute');

    if (mode === 'compare_only') {
      if (!body?.compareToRunId || !this.isValidUUID(body.compareToRunId)) {
        return {
          sourceRunId: source.id,
          error: 'compareToRunId required for compare_only',
        };
      }
      const target = await this.prisma.tripRun.findUnique({
        where: { id: body.compareToRunId.trim() },
        select: {
          id: true,
          userQuery: true,
          status: true,
          metadata: true,
        },
      });
      if (!target) {
        return { sourceRunId: source.id, error: 'compare target not found' };
      }
      const afterObs = overlayFeedbackOntoObservability(
        resolveTripRunObservabilityFromStored({
          metadata: (target.metadata as any) || {},
          userQuery: target.userQuery,
          status: target.status,
        }),
        (target.metadata as any) || {},
      );
      return {
        sourceRunId: source.id,
        replayRunId: target.id,
        replayMode: 'compare_only',
        compare: compareDecisionObservability(beforeObs, afterObs),
      };
    }

    if (!this.agentService) {
      return {
        sourceRunId: source.id,
        replayMode: 'reexecute',
        error: 'AgentService unavailable; use mode=compare_only with compareToRunId',
      };
    }

    const requestId = `admin-replay-${randomUUID()}`;
    const snapshotId =
      (typeof meta.memory_snapshot_id === 'string' && meta.memory_snapshot_id) ||
      (typeof meta.memory_summary?.snapshot_id === 'string' && meta.memory_summary.snapshot_id) ||
      null;
    const entryPoint =
      (typeof meta.entry_point === 'string' && meta.entry_point) ||
      (typeof meta.entryPoint === 'string' && meta.entryPoint) ||
      undefined;

    const inputContext =
      meta.input_context && typeof meta.input_context === 'object'
        ? (meta.input_context as Record<string, any>)
        : {};

    const request: RouteAndRunRequestDto = {
      request_id: requestId,
      user_id: source.userId || 'anonymous',
      trip_id: source.tripId || undefined,
      message:
        (typeof body?.messageOverride === 'string' && body.messageOverride.trim()) ||
        source.userQuery ||
        '(admin_replay)',
      conversation_context: Array.isArray(inputContext.recent_messages_preview)
        ? {
            recent_messages: inputContext.recent_messages_preview.map(String),
          }
        : undefined,
      options: {
        entry_point: entryPoint,
        dry_run: body?.dryRun === true,
        ...(snapshotId
          ? {
              orchestration_replay_anchor_snapshot_id: snapshotId,
              orchestration_replay_strict_seal: true,
            }
          : {}),
        execution_model_runtime_hint: 'admin_decision_replay',
      } as any,
    };

    // 标记：供新 TripRun metadata 关联（由 orchestration 写入 request_id）
    (request as any).__admin_replay_of_trip_run_id = source.id;

    let response: RouteAndRunResponseDto;
    try {
      response = await this.agentService.routeAndRun(request);
    } catch (err: any) {
      this.logger.error(`Admin replay failed: ${err?.message ?? err}`);
      return {
        sourceRunId: source.id,
        replayMode: snapshotId ? 'strict_snapshot' : 'best_effort',
        replayRequestId: requestId,
        error: err?.message ?? String(err),
        compare: null,
      };
    }

    const afterObs = buildTripRunObservabilityV1(response, {
      userQuery: request.message,
      status: response.result?.status ?? null,
    });

    const durableId =
      typeof (response.observability as any)?.durable_trip_run_id === 'string'
        ? (response.observability as any).durable_trip_run_id
        : null;

    // 若产生了新 TripRun，打上 replay_of 关联
    if (durableId && this.isValidUUID(durableId)) {
      try {
        const existing = await this.prisma.tripRun.findUnique({
          where: { id: durableId },
          select: { metadata: true },
        });
        const m = {
          ...((existing?.metadata as Record<string, any>) || {}),
          replay_of_trip_run_id: source.id,
          replay_request_id: requestId,
          replay_mode: snapshotId ? 'strict_snapshot' : 'best_effort',
        };
        await this.prisma.tripRun.update({
          where: { id: durableId },
          data: { metadata: m as any },
        });
      } catch (e: any) {
        this.logger.warn(`Failed to stamp replay_of metadata: ${e?.message ?? e}`);
      }
    }

    const compare = compareDecisionObservability(beforeObs, afterObs);

    return {
      sourceRunId: source.id,
      replayRunId: durableId,
      replayRequestId: requestId,
      replayMode: snapshotId ? 'strict_snapshot' : 'best_effort',
      decisionSelected: {
        before: beforeObs?.decisionTrace?.finalDecision.selected ?? null,
        after: afterObs?.decisionTrace?.finalDecision.selected ?? null,
      },
      compare: {
        ...compare,
        headline: {
          safetyDeltaPct: compare.safetyDelta.scoreDelta,
          preferenceDeltaPct: compare.preferenceDelta.scoreDelta,
          evidenceCoverageDeltaPct: compare.evidenceDelta.delta,
          toolEfficiencyDeltaPct: compare.qualityDelta.toolEfficiencyDelta,
        },
      },
      responseSummary: {
        status: response.result?.status ?? null,
        deliveryVerdict: (response as any)?.delivery_verdict ?? null,
        modeFinal: (response.observability as any)?.mode_final ?? null,
      },
    };
  }
}
