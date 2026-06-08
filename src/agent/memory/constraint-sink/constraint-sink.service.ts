import { randomUUID } from 'crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TripTaskMemoryService } from '../../context-engine/services/trip-task-memory.service';
import { PrometheusMetricsService } from '../../../monitoring/prometheus-metrics.service';
import type {
  ConstraintSinkResult,
  ConstraintSinkScheduleParams,
} from './constraint-sink.types';
import { extractConstraintDeltasFromMessage } from './constraint-sink.extractor';
import { appendConstraintSinkPatch } from './constraint-sink-state.util';

@Injectable()
export class ConstraintSinkService {
  private readonly logger = new Logger(ConstraintSinkService.name);

  constructor(
    @Optional() private readonly tripTaskMemory?: TripTaskMemoryService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() private readonly promMetrics?: PrometheusMetricsService,
  ) {}

  isEnabled(): boolean {
    return this.configService?.get<string>('FEATURE_MEMORY_CONSTRAINT_SINK') === '1';
  }

  private minConfidence(): number {
    const raw = this.configService?.get<string>('CONSTRAINT_SINK_MIN_CONFIDENCE');
    const n = raw != null ? Number(raw) : 0.72;
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.72;
  }

  /** Fire-and-forget after PA session persist; must not block chat response. */
  schedule(params: ConstraintSinkScheduleParams): void {
    if (!this.isEnabled()) return;
    const tripId = String(params.tripId ?? '').trim();
    const userId = String(params.userId ?? '').trim();
    if (!tripId) return;
    if (!userId || userId === 'anonymous') return;

    setImmediate(() => {
      void this.extractAndPatch(params).catch((e: unknown) => {
        this.logger.warn(
          `ConstraintSink async failed trip=${tripId}: ${e instanceof Error ? e.message : String(e)}`,
        );
      });
    });
  }

  async extractAndPatch(params: ConstraintSinkScheduleParams): Promise<ConstraintSinkResult> {
    if (!this.isEnabled()) {
      this.promMetrics?.recordConstraintSinkSkipped('feature_off');
      return { applied: false, patch_ids: [], skipped_reason: 'feature_off' };
    }
    if (!this.tripTaskMemory) {
      this.promMetrics?.recordConstraintSinkSkipped('extract_failed');
      return { applied: false, patch_ids: [], skipped_reason: 'extract_failed' };
    }

    const tripId = String(params.tripId).trim();
    const userId = String(params.userId).trim();
    if (!tripId) {
      this.promMetrics?.recordConstraintSinkSkipped('no_trip_id');
      return { applied: false, patch_ids: [], skipped_reason: 'no_trip_id' };
    }
    if (!userId || userId === 'anonymous') {
      this.promMetrics?.recordConstraintSinkSkipped('anonymous_user');
      return { applied: false, patch_ids: [], skipped_reason: 'anonymous_user' };
    }

    const candidate = extractConstraintDeltasFromMessage(params.message);
    if (!candidate) {
      this.promMetrics?.recordConstraintSinkSkipped('extract_failed');
      return { applied: false, patch_ids: [], skipped_reason: 'extract_failed' };
    }
    if (candidate.confidence < this.minConfidence()) {
      this.promMetrics?.recordConstraintSinkSkipped('low_confidence');
      return {
        applied: false,
        patch_ids: [],
        skipped_reason: 'low_confidence',
        confidence: candidate.confidence,
      };
    }

    const existing = await this.tripTaskMemory.get(tripId);
    const patch = {
      id: randomUUID(),
      at: new Date().toISOString(),
      message_id: params.messageId,
      session_id: params.sessionId,
      confidence: candidate.confidence,
      delta: candidate.delta,
      provenance: candidate.provenance,
    };

    const constraints = appendConstraintSinkPatch(existing, patch);
    const history = [
      ...(existing?.history ?? []),
      {
        at: patch.at,
        event: 'constraint_sink',
        payload: {
          patch_id: patch.id,
          requestId: params.sessionId,
          applied_keys: candidate.applied_keys,
          confidence: candidate.confidence,
        },
      },
    ].slice(-50);

    await this.tripTaskMemory.update(tripId, { constraints, history });

    this.promMetrics?.recordConstraintSinkPatchApplied();
    this.logger.debug(
      `ConstraintSink applied trip=${tripId} patch=${patch.id} keys=[${candidate.applied_keys.join(',')}]`,
    );

    return {
      applied: true,
      patch_ids: [patch.id],
      confidence: candidate.confidence,
    };
  }
}
