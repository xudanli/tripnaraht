/**
 * Travel Memory Runtime — V1 API 门面。
 *
 * 原则：Current State ≠ Memory；Vector Search 不是 Architecture。
 * 核心循环：Observe → Decide → Act → Outcome → Remember → Reuse → Verify
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { MemoryLedgerStore } from '../ledger/memory-ledger.store';
import { PrismaTravelMemoryLedgerService } from '../ledger/prisma-travel-memory-ledger.service';
import { evaluateWritePolicy } from '../policy/memory-write-policy';
import {
  buildTripMemoryView,
  buildUserProfileView,
} from '../views/memory-view-builder';
import { buildMemoryContextPackage } from './memory-context-builder';
import {
  ingestCgusOutcomeIntoMemoryLedger,
  type CgusOutcomeMemoryIngestResult,
} from '../episode/cgus-outcome-memory-ingest.util';
import type { DecisionEpisodeV1 } from '../episode/decision-episode.types';
import type { CgusDecisionTraceV1 } from '../../trips/decision/optimization/cgus-decision-trace.types';
import type { CgusOutcomeLoopWriteKind } from '../../trips/decision/optimization/cgus-trip-review.util';
import type {
  BuildContextRequest,
  ConfirmMemoryRequest,
  InvalidateMemoryRequest,
  TravelMemoryApi,
  WriteCandidateRequest,
  WriteCandidateResult,
} from './memory-api.types';
import type { MemoryEventV1 } from '../types/memory-event.types';
import type {
  TripMemoryView,
  UserProfileMemoryView,
} from '../types/memory-context-package.types';

const EPISODE_RING_MAX = 500;

@Injectable()
export class TravelMemoryRuntimeService implements TravelMemoryApi {
  private readonly logger = new Logger(TravelMemoryRuntimeService.name);
  private readonly ledger = new MemoryLedgerStore();
  /** tripId → episodes（热索引，供 build_context / recall） */
  private readonly episodesByTrip = new Map<string, DecisionEpisodeV1[]>();
  /** decision_id → 最近一次 DECISION_EPISODE_REF eventId（SUPERSEDE） */
  private readonly episodeEventByDecision = new Map<string, string>();

  constructor(
    @Optional() private readonly durableLedger?: PrismaTravelMemoryLedgerService,
  ) {}

  /** 测试 / 注入用：暴露 ledger（不作为生产写旁路） */
  getLedger(): MemoryLedgerStore {
    return this.ledger;
  }

  getProfile(userId: string): UserProfileMemoryView {
    return buildUserProfileView(this.ledger, userId);
  }

  getTripMemory(tripId: string): TripMemoryView {
    return buildTripMemoryView(this.ledger, tripId);
  }

  getRelevantDecisions(input: {
    decisionType?: string;
    tripId?: string;
    scope?: 'USER' | 'TRIP';
    episodes?: DecisionEpisodeV1[];
    limit?: number;
  }): DecisionEpisodeV1[] {
    let eps =
      input.episodes ??
      (input.tripId ? [...(this.episodesByTrip.get(input.tripId) ?? [])] : this.allEpisodes());
    if (input.tripId) {
      eps = eps.filter((e) => e.context.tripId === input.tripId);
    }
    if (input.decisionType) {
      const t = input.decisionType.toUpperCase();
      eps = eps.filter((e) => e.decision.type.toUpperCase().includes(t));
    }
    return eps.slice(-(input.limit ?? 5));
  }

  /**
   * P0：Semantic 仅为辅助层 stub；生产委托现有 RAG / trips/memory。
   * 明确不是 Source of Truth。
   */
  searchSemantic(_query: string): { items: Array<{ text: string }> } {
    return { items: [] };
  }

  writeCandidate(req: WriteCandidateRequest): WriteCandidateResult {
    const decision = evaluateWritePolicy({
      sourceType: req.sourceType,
      confidence: req.confidence,
      explicitConfirm: req.explicitConfirm,
    });
    if (decision.allow === false) {
      return {
        ok: false,
        reason: decision.reason,
        keepEpisodeOnly: decision.keepEpisodeOnly,
      };
    }

    const event = this.ledger.append({
      op: decision.op,
      subject: req.subject,
      memoryType: req.memoryType,
      predicate: req.predicate,
      value: req.value,
      scope: req.scope,
      source: {
        type: req.sourceType,
        conversationId: req.conversationId,
        turnId: req.turnId,
        decisionId: req.decisionId,
        episodeId: req.episodeId,
      },
      confidence: decision.confidence,
      status: decision.status,
      validFrom: req.validFrom,
    });
    void this.persistDurable(event);
    return { ok: true, event };
  }

  confirm(req: ConfirmMemoryRequest): MemoryEventV1 {
    const event = this.ledger.append({
      op: 'CONFIRM',
      subject: req.subject,
      memoryType: 'PREFERENCE',
      predicate: req.predicate,
      value: req.value,
      scope: req.scope,
      source: { type: 'USER_EXPLICIT' },
      confidence: 1,
      status: 'ACTIVE',
      supersedesEventId: req.supersedesEventId ?? null,
    });
    void this.persistDurable(event);
    return event;
  }

  invalidate(req: InvalidateMemoryRequest): MemoryEventV1 {
    const event = this.ledger.append({
      op: 'INVALIDATE',
      subject: req.subject,
      memoryType: 'PREFERENCE',
      predicate: req.predicate,
      value: { redacted: true, reason: req.reason ?? 'user_or_policy_invalidate' },
      scope: req.scope,
      source: { type: 'USER_EXPLICIT', note: req.reason },
      confidence: 1,
      status: 'INVALIDATED',
      supersedesEventId: req.targetEventId,
    });
    void this.persistDurable(event);
    return event;
  }

  buildContext(req: BuildContextRequest) {
    const episodes =
      req.episodes ??
      (req.tripId ? this.episodesByTrip.get(req.tripId) ?? [] : this.allEpisodes());
    return buildMemoryContextPackage(this.ledger, { ...req, episodes });
  }

  /**
   * CGUS Outcome Loop 闭环入口：Trace → Episode → Attribution → Ledger。
   * 主路径失败不得抛出；由 Kernel 侧 Optional 调用。
   */
  ingestCgusOutcomeLoop(input: {
    trace: CgusDecisionTraceV1;
    kind: CgusOutcomeLoopWriteKind;
    userId?: string | null;
    day?: number | null;
    weatherRisk?: string | null;
    scheduleSlackMinutes?: number | null;
  }): CgusOutcomeMemoryIngestResult {
    const previousEpisodeEventId =
      this.episodeEventByDecision.get(input.trace.decision_id) ?? null;

    const result = ingestCgusOutcomeIntoMemoryLedger({
      ledger: this.ledger,
      trace: input.trace,
      kind: input.kind,
      userId: input.userId,
      day: input.day,
      weatherRisk: input.weatherRisk,
      scheduleSlackMinutes: input.scheduleSlackMinutes,
      previousEpisodeEventId,
    });

    this.episodeEventByDecision.set(
      input.trace.decision_id,
      result.episodeEvent.memoryEventId,
    );
    this.upsertEpisodeIndex(result.episode);

    const tripId = input.trace.trip_id;
    void this.persistDurable(result.episodeEvent, tripId);
    if (result.candidateEvent) {
      void this.persistDurable(result.candidateEvent, tripId);
    }

    this.logger.debug(
      `[TMR] ingestCgus kind=${input.kind} decision=${input.trace.decision_id} ` +
        `episode=${result.episode.episodeId} candidate=${!!result.candidateEvent} ` +
        `skip=${result.candidateSkippedReason ?? '-'} durable=${!!this.durableLedger?.isEnabled()}`,
    );

    return result;
  }

  /** Durable persist 失败不抛；热路径 Ledger 仍是真相直到 DB 可用 */
  private persistDurable(event: MemoryEventV1, tripId?: string | null): void {
    if (!this.durableLedger) return;
    void this.durableLedger.persistEvent(event, tripId).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[TMR] durable persist async fail: ${msg}`);
    });
  }

  private upsertEpisodeIndex(episode: DecisionEpisodeV1): void {
    const tripId = episode.context.tripId;
    const list = this.episodesByTrip.get(tripId) ?? [];
    const idx = list.findIndex((e) => e.episodeId === episode.episodeId);
    if (idx >= 0) {
      list[idx] = episode;
    } else {
      list.push(episode);
    }
    while (list.length > EPISODE_RING_MAX) list.shift();
    this.episodesByTrip.set(tripId, list);
  }

  private allEpisodes(): DecisionEpisodeV1[] {
    const out: DecisionEpisodeV1[] = [];
    for (const list of this.episodesByTrip.values()) out.push(...list);
    return out;
  }
}
