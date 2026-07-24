// src/agent/memory/services/memory-context-assembler.service.ts
import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MemoryService } from './memory.service';
import type { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import type { AgentMemoryContext, TripFeedbackSnapshot } from '../interfaces/agent-memory-context.interface';
import type { RouteAndRunRequestDto } from '../../dto/route-and-run.dto';
import type { RouteRunPartyProfileSnapshot } from '../interfaces/agent-memory-context.interface';
import { resolveRouteRunPartyProfileSnapshot } from '../../utils/route-and-run-party-profile.util';
import { TripTaskMemoryService } from '../../context-engine/services/trip-task-memory.service';
import { PrometheusMetricsService } from '../../../monitoring/prometheus-metrics.service';
import { AgentMemoryContextStore } from '../context/agent-memory-context.store';
import { AgentExecutionContextStore } from '../../runtime/agent-execution-context.store';
import { WorldDecisionMemoryService } from '../decision-memory/world-decision-memory.service';
import { applyDecisionRingToExecutionOperationalOverlay } from '../../compression/negative-constraint-compressor.util';
import {
  WORLD_DECISION_MEMORY_ARCHIVE,
  type WorldDecisionMemoryArchivePort,
} from '../decision-memory/world-decision-memory-archive.port';
import {
  buildLedgerAnchorBundle,
  buildLedgerEdgesFromNodes,
  projectRouteDirectionMemoriesToLedgerNodes,
} from '../decision-ledger/decision-ledger-anchors.util';
import { deriveMemoryLedgerPhaseFromTripTask } from '../decision-ledger/decision-ledger-world-anchor.util';
import { invalidateLedgerByAnchorDrift, planLedgerRecomputeOrder } from '../decision-ledger/decision-ledger-invalidation.util';
import { mergePendingWorldAnchorsIntoLedger } from '../decision-ledger/ledger-pending-audit.merge.util';
import type { DecisionLedgerSnapshot } from '../decision-ledger/decision-ledger.types';
import { LedgerPendingAuditStoreService } from '../decision-ledger/ledger-pending-audit.store.service';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AgentMemoryUserBasics } from '../interfaces/agent-memory-context.interface';
import { extractAgentMemoryUserBasicsFromPreferences } from '../utils/agent-memory-user-basics.util';
import { buildMergedTravelPreferenceSummary } from '../utils/travel-preference-merge.util';
import {
  buildActiveRouteHealthSnapshot,
  buildFailurePatternsFromRouteHealth,
  collectL3LookupCandidates,
  parseRouteDirectionId,
  resolveCountryCodeForL3Lookup,
  routeHealthSnapshotKey,
  type ActiveRouteHealthSnapshot,
} from '../utils/route-health-memory.util';
import {
  L4_TRIP_FEEDBACK_TAIL,
  projectTripFeedbackSnapshots,
} from '../utils/trip-feedback-memory.util';
import { TripIntentDigestService } from './trip-intent-digest.service';
import { loadDecisionLedgerCausalityConsoleV1 } from '../../../trips/decision-semantics/read/decision-ledger-console-read.util';
import type { DecisionLedgerCausalityConsoleV1 } from '../../../trips/decision-semantics/read/decision-ledger-console-read.util';

export type MemoryContractObservabilityV1 = {
  revision: 'v1';
  loaded: boolean;
  layers: string[];
  user_id_present: boolean;
  snapshot_id: string;
  snapshot_version: number;
  /** ISO8601：与 snapshot 对齐，供 metrics 计算 staleness */
  loaded_at_iso: string;
};

const TRIP_WORLD_DECISION_ARCHIVE_TAIL = 32;

@Injectable()
export class MemoryContextAssemblerService {
  private readonly logger = new Logger(MemoryContextAssemblerService.name);

  constructor(
    private readonly memoryService: MemoryService,
    @Optional() private readonly tripTaskMemory?: TripTaskMemoryService,
    @Optional() private readonly prom?: PrometheusMetricsService,
    @Optional() private readonly agentMemoryContextStore?: AgentMemoryContextStore,
    @Optional() private readonly agentExecutionContextStore?: AgentExecutionContextStore,
    @Optional() private readonly worldDecisionMemory?: WorldDecisionMemoryService,
    @Optional()
    @Inject(WORLD_DECISION_MEMORY_ARCHIVE)
    private readonly wdArchive?: WorldDecisionMemoryArchivePort,
    @Optional() private readonly ledgerPendingAudit?: LedgerPendingAuditStoreService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly tripIntentDigest?: TripIntentDigestService,
  ) {}

  /**
   * route_and_run 前置装载：唯一允许在此路径直读 DB/L1/L2；结果写入 AgentMemoryContext snapshot。
   */
  async loadForRouteAndRun(request: RouteAndRunRequestDto): Promise<AgentMemoryContext> {
    const snapshotId = randomUUID();
    const snapshotVersion = 1;

    try {
      const ctx = await this.loadPayload(request, snapshotId, snapshotVersion);
      this.prom?.recordMemoryContextLoadSuccess();
      return ctx;
    } catch (e: any) {
      this.prom?.recordMemoryContextLoadFailure();
      this.logger.error(`MemoryContextAssembler: load failed: ${e?.message ?? e}`);
      throw e;
    }
  }

  private async loadPayload(
    request: RouteAndRunRequestDto,
    snapshotId: string,
    snapshotVersion: number,
  ): Promise<AgentMemoryContext> {
    const requestId = request.request_id;
    const userId =
      request.user_id && String(request.user_id).trim() !== '' ? String(request.user_id).trim() : null;
    const tripId =
      request.trip_id && String(request.trip_id).trim() !== ''
        ? String(request.trip_id).trim()
        : null;

    const layers: string[] = [];
    let userProfile: UserTravelProfile | null = null;
    let userBasics: AgentMemoryUserBasics | null = null;
    let recentDecisions: AgentMemoryContext['recentDecisions'] = [];

    if (userId && userId !== 'anonymous') {
      try {
        const [l1, l0] = await Promise.all([
          this.memoryService.getUserTravelProfile(userId),
          this.loadL0UserBasics(userId),
        ]);
        userProfile = l1;
        userBasics = l0;
        layers.push('L1_user_profile');
        if (userBasics) {
          layers.push('L0_user_basics');
        }
      } catch (e: any) {
        this.logger.warn(`MemoryContextAssembler: L1/L0 parallel load failed: ${e?.message ?? e}`);
        try {
          userProfile = await this.memoryService.getUserTravelProfile(userId);
          layers.push('L1_user_profile');
        } catch (e2: any) {
          this.logger.warn(`MemoryContextAssembler: L1 load failed: ${e2?.message ?? e2}`);
        }
        try {
          userBasics = await this.loadL0UserBasics(userId);
          if (userBasics) {
            layers.push('L0_user_basics');
          }
        } catch (e3: any) {
          this.logger.warn(`MemoryContextAssembler: L0 load failed: ${e3?.message ?? e3}`);
        }
      }
      try {
        recentDecisions = await this.memoryService.getUserRouteDirectionDecisions(userId);
        layers.push('L2_recent_decisions');
      } catch (e: any) {
        this.logger.warn(`MemoryContextAssembler: L2 list failed: ${e?.message ?? e}`);
      }
    }

    let activeTripState: AgentMemoryContext['activeTripState'] = null;
    if (tripId && this.tripTaskMemory) {
      try {
        activeTripState = await this.tripTaskMemory.get(tripId);
        if (activeTripState) {
          layers.push('trip_task_memory');
        }
      } catch (e: any) {
        this.logger.warn(`MemoryContextAssembler: trip task memory failed: ${e?.message ?? e}`);
      }
    }

    let recentWorldDecisions: AgentMemoryContext['recentWorldDecisions'] = [];
    if (tripId && this.wdArchive?.isEnabled()) {
      try {
        recentWorldDecisions = await this.wdArchive.listRecentForTrip(tripId, TRIP_WORLD_DECISION_ARCHIVE_TAIL);
        if (recentWorldDecisions.length > 0) {
          layers.push('trip_world_decision_archive');
        }
      } catch (e: any) {
        this.logger.warn(`MemoryContextAssembler: trip WDMA archive load failed: ${e?.message ?? e}`);
      }
    }

    const recoveryHistory = activeTripState?.recovery_audit_tail ?? [];
    const loadedAt = new Date().toISOString();

    const routePartyProfile = resolveRouteRunPartyProfileSnapshot(request);
    if (routePartyProfile) {
      layers.push('route_party_profile');
    }

    const travelPreference = buildMergedTravelPreferenceSummary({
      profile: userProfile,
      routeParty: routePartyProfile,
      basics: userBasics,
    });
    const anchorBundle = buildLedgerAnchorBundle({
      activeTripState,
      travelPreference,
      userProfile,
      routePartyProfile,
      recentWorldDecisions,
    });
    const ledgerNodes = projectRouteDirectionMemoriesToLedgerNodes(recentDecisions, anchorBundle.anchors);
    let ledgerForDrift: DecisionLedgerSnapshot = {
      revision: 'v1' as const,
      nodes: ledgerNodes,
      edges: buildLedgerEdgesFromNodes(ledgerNodes),
      anchors: anchorBundle.anchors,
      worldSlices: anchorBundle.worldSlices,
      staleWorldTopics: anchorBundle.staleWorldTopics,
    };
    if (tripId && this.ledgerPendingAudit?.isEnabled()) {
      const pending = await this.ledgerPendingAudit.consume(tripId);
      if (pending) {
        ledgerForDrift = mergePendingWorldAnchorsIntoLedger(ledgerForDrift, pending);
        layers.push('decision_ledger_pending_mcp_world');
      }
    }
    const memoryPhase = deriveMemoryLedgerPhaseFromTripTask(activeTripState);
    const drifted = invalidateLedgerByAnchorDrift(ledgerForDrift, { memoryPhase });
    if (drifted.invalidatedNodeIds.length > 0 || drifted.staleNodeIds.length > 0) {
      layers.push('decision_ledger_drift');
    }
    if (anchorBundle.staleWorldTopics.length > 0) {
      layers.push('decision_ledger_stale_world_topics');
    }
    const ledgerRecomputePlan = planLedgerRecomputeOrder(drifted.ledger);

    const l3Promise = this.loadL3RouteHealth({
      request,
      activeTripState,
      recentDecisions,
      travelPreference,
      loadedAt,
    });
    const l4Promise =
      userId && userId !== 'anonymous'
        ? this.loadL4TripFeedback(userId)
        : Promise.resolve({
            recentTripFeedbacks: [] as TripFeedbackSnapshot[],
            layers: [] as string[],
            metadata: {} as Record<string, unknown>,
          });
    let domainInfluenceDigest: AgentMemoryContext['domainInfluenceDigest'] = null;
    let wishConstraintDigest: AgentMemoryContext['wishConstraintDigest'] = null;
    let privateWishDigest: AgentMemoryContext['privateWishDigest'] = null;
    let decisionProfilingDigest: AgentMemoryContext['decisionProfilingDigest'] = null;
    let negotiationDigest: AgentMemoryContext['negotiationDigest'] = null;
    const digestPromise =
      tripId && this.tripIntentDigest
        ? this.tripIntentDigest.loadForMemoryContext(tripId, userId).catch((e: any) => {
            this.logger.warn(`MemoryContextAssembler: trip intent digest failed: ${e?.message ?? e}`);
            return null;
          })
        : Promise.resolve(null);
    const [l3, l4, digests] = await Promise.all([l3Promise, l4Promise, digestPromise]);
    layers.push(...l3.layers, ...l4.layers);
    if (digests) {
      domainInfluenceDigest = digests.domainInfluenceDigest;
      wishConstraintDigest = digests.wishConstraintDigest;
      privateWishDigest = digests.privateWishDigest;
      decisionProfilingDigest = digests.decisionProfilingDigest;
      negotiationDigest = digests.negotiationDigest;
      if (domainInfluenceDigest) layers.push('trip_domain_influence_digest');
      if (wishConstraintDigest) layers.push('trip_wish_constraint_digest');
      if (privateWishDigest) layers.push('trip_private_wish_digest');
      if (decisionProfilingDigest) layers.push('trip_decision_profiling_digest');
      if (negotiationDigest) layers.push('trip_negotiation_digest');
    }

    const mergedMetadata = { ...l3.metadata, ...l4.metadata };

    const ctx: AgentMemoryContext = {
      snapshotId,
      snapshotVersion,
      requestId,
      userId,
      tripId,
      userProfile,
      userBasics,
      travelPreference,
      routePartyProfile,
      recentDecisions,
      decisionLedger: drifted.ledger,
      ledgerRecomputePlan,
      recentWorldDecisions,
      activeTripState,
      recoveryHistory,
      failurePatterns: l3.failurePatterns,
      activeRouteHealthSnapshot: l3.activeRouteHealthSnapshot,
      routeHealthByKey: l3.routeHealthByKey,
      recentTripFeedbacks: l4.recentTripFeedbacks,
      domainInfluenceDigest,
      wishConstraintDigest,
      privateWishDigest,
      decisionProfilingDigest,
      negotiationDigest,
      loadedAt,
      observability: {
        layers,
        ...(Object.keys(mergedMetadata).length > 0 ? { metadata: mergedMetadata } : {}),
      },
    };

    this.logger.debug(
      `MemoryContextAssembler: snapshot=${snapshotId} v${snapshotVersion} layers=[${layers.join(',')}] request_id=${requestId}`,
    );
    return ctx;
  }

  buildObservability(memory: AgentMemoryContext): MemoryContractObservabilityV1 {
    return {
      revision: 'v1',
      loaded: true,
      layers: memory.observability.layers,
      user_id_present: !!memory.userId && memory.userId !== 'anonymous',
      snapshot_id: memory.snapshotId,
      snapshot_version: memory.snapshotVersion,
      loaded_at_iso: memory.loadedAt,
    };
  }

  /** Decision Semantics ↔ Ledger caused_by（Memory Console / route_and_run 调试） */
  async loadDecisionLedgerCausalityForTrip(
    tripId: string,
    ledger?: DecisionLedgerSnapshot | null,
    ledgerSnapshotVersion?: number,
  ): Promise<DecisionLedgerCausalityConsoleV1 | null> {
    if (!this.prisma?.isDbConnected()) return null;
    try {
      return await loadDecisionLedgerCausalityConsoleV1({
        tripId,
        prisma: this.prisma,
        ledger: ledger ?? null,
        ledgerSnapshotVersion,
      });
    } catch (e: unknown) {
      this.logger.warn(
        `loadDecisionLedgerCausalityForTrip failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }

  /**
   * 将当前 request 的 Decision ring 压缩进执行上下文（与 WorldDecisionMemory.append 内 refresh 等价）。
   * 供编排阶段在拓扑调整后显式对齐 overlay。
   */
  refreshOperationalNegativeExecutionOverlay(): void {
    const mem = this.agentMemoryContextStore?.get();
    const ex = this.agentExecutionContextStore?.get();
    if (!mem || !ex || !this.worldDecisionMemory) return;
    if (mem.requestId !== ex.requestId) return;
    applyDecisionRingToExecutionOperationalOverlay(ex, mem.requestId, this.worldDecisionMemory);
  }

  /** L0：`UserProfile.preferences`（Prisma），与 L1 并行读取；失败或非 DB 模式返回 null。 */
  private async loadL0UserBasics(userId: string): Promise<AgentMemoryUserBasics | null> {
    if (!this.prisma?.isDbConnected()) {
      return null;
    }
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { preferences: true, updatedAt: true },
      });
      if (!row?.preferences) {
        return null;
      }
      return extractAgentMemoryUserBasicsFromPreferences(row.preferences, row.updatedAt.toISOString());
    } catch (e: any) {
      this.logger.warn(`MemoryContextAssembler: L0 user basics load failed: ${e?.message ?? e}`);
      return null;
    }
  }

  /**
   * L3：路线健康度装配（唯一 DB 读入口）；结果写入 snapshot，Injector 禁止二次读取。
   */
  private async loadL3RouteHealth(input: {
    request: RouteAndRunRequestDto;
    activeTripState: AgentMemoryContext['activeTripState'];
    recentDecisions: AgentMemoryContext['recentDecisions'];
    travelPreference: Record<string, unknown> | null;
    loadedAt: string;
  }): Promise<{
    failurePatterns: string[];
    activeRouteHealthSnapshot: ActiveRouteHealthSnapshot | null;
    routeHealthByKey: Record<string, ActiveRouteHealthSnapshot>;
    layers: string[];
    metadata: Record<string, unknown>;
  }> {
    const empty = {
      failurePatterns: [] as string[],
      activeRouteHealthSnapshot: null as ActiveRouteHealthSnapshot | null,
      routeHealthByKey: {} as Record<string, ActiveRouteHealthSnapshot>,
      layers: [] as string[],
      metadata: {} as Record<string, unknown>,
    };

    const defaultCountryCode = resolveCountryCodeForL3Lookup({
      request: input.request,
      travelPreference: input.travelPreference,
      recentDecisions: input.recentDecisions,
    });
    const candidates = collectL3LookupCandidates({
      activeTripState: input.activeTripState,
      recentDecisions: input.recentDecisions,
      defaultCountryCode,
    });
    if (candidates.length === 0) {
      return empty;
    }

    const routeHealthByKey: Record<string, ActiveRouteHealthSnapshot> = {};
    const metadata: Record<string, unknown> = {};
    const layers: string[] = [];

    for (const candidate of candidates) {
      try {
        const health = await this.memoryService.getRouteDirectionHealth(
          candidate.routeDirectionId,
          candidate.countryCode,
        );
        if (!health) continue;
        routeHealthByKey[routeHealthSnapshotKey(candidate.routeDirectionId, candidate.countryCode)] =
          buildActiveRouteHealthSnapshot(health, input.loadedAt);
      } catch (e: any) {
        metadata[`L3_load_error_${candidate.routeDirectionId}_${candidate.countryCode}`] =
          e?.message ?? String(e);
        this.logger.warn(
          `MemoryContextAssembler: L3 load failed rd=${candidate.routeDirectionId} cc=${candidate.countryCode}: ${e?.message ?? e}`,
        );
      }
    }

    if (Object.keys(routeHealthByKey).length > 0) {
      layers.push('L3_route_health');
    }

    const activeRouteId = parseRouteDirectionId(input.activeTripState?.selectedRouteDirectionId);
    let activeRouteHealthSnapshot: ActiveRouteHealthSnapshot | null = null;
    if (activeRouteId != null && defaultCountryCode) {
      activeRouteHealthSnapshot =
        routeHealthByKey[routeHealthSnapshotKey(activeRouteId, defaultCountryCode)] ?? null;
    }
    if (!activeRouteHealthSnapshot) {
      const firstKey = Object.keys(routeHealthByKey)[0];
      activeRouteHealthSnapshot = firstKey ? routeHealthByKey[firstKey] : null;
    }

    const failurePatterns =
      activeRouteHealthSnapshot != null
        ? buildFailurePatternsFromRouteHealth({
            commonFailureReasons: [...activeRouteHealthSnapshot.commonFailureReasons],
          })
        : [];

    return {
      failurePatterns,
      activeRouteHealthSnapshot,
      routeHealthByKey,
      layers,
      metadata,
    };
  }

  /**
   * L4：行程反馈 tail 装配（唯一 DB 读入口 via MemoryService）；不写入 L1。
   */
  private async loadL4TripFeedback(userId: string): Promise<{
    recentTripFeedbacks: TripFeedbackSnapshot[];
    layers: string[];
    metadata: Record<string, unknown>;
  }> {
    const empty = {
      recentTripFeedbacks: [] as TripFeedbackSnapshot[],
      layers: [] as string[],
      metadata: {} as Record<string, unknown>,
    };

    try {
      const raw = await this.memoryService.getUserTripFeedbacksTail(userId, L4_TRIP_FEEDBACK_TAIL);
      const recentTripFeedbacks = projectTripFeedbackSnapshots(raw, L4_TRIP_FEEDBACK_TAIL);
      if (recentTripFeedbacks.length === 0) {
        return empty;
      }
      return {
        recentTripFeedbacks,
        layers: ['L4_trip_feedback'],
        metadata: {},
      };
    } catch (e: any) {
      const message = e?.message ?? String(e);
      this.logger.warn(`MemoryContextAssembler: L4 load failed user=${userId}: ${message}`);
      return {
        ...empty,
        metadata: { L4_load_error: message },
      };
    }
  }
}
