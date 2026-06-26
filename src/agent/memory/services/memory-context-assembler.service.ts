// src/agent/memory/services/memory-context-assembler.service.ts
import { randomUUID } from 'crypto';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MemoryService } from './memory.service';
import type { UserTravelProfile } from '../interfaces/user-travel-profile.interface';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
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
import { TripIntentDigestService } from './trip-intent-digest.service';

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
    let recentDecisions: AgentMemoryContext['recentDecisions'] = [];

    if (userId && userId !== 'anonymous') {
      try {
        userProfile = await this.memoryService.getUserTravelProfile(userId);
        layers.push('L1_user_profile');
      } catch (e: any) {
        this.logger.warn(`MemoryContextAssembler: L1 load failed: ${e?.message ?? e}`);
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

    const travelPreference = this.mergeTravelPreferenceSummary(userProfile, routePartyProfile);
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

    let domainInfluenceDigest: AgentMemoryContext['domainInfluenceDigest'] = null;
    let wishConstraintDigest: AgentMemoryContext['wishConstraintDigest'] = null;
    let privateWishDigest: AgentMemoryContext['privateWishDigest'] = null;
    let decisionProfilingDigest: AgentMemoryContext['decisionProfilingDigest'] = null;
    let negotiationDigest: AgentMemoryContext['negotiationDigest'] = null;
    if (tripId && this.tripIntentDigest) {
      try {
        const digests = await this.tripIntentDigest.loadForMemoryContext(tripId, userId);
        domainInfluenceDigest = digests.domainInfluenceDigest;
        wishConstraintDigest = digests.wishConstraintDigest;
        privateWishDigest = digests.privateWishDigest;
        decisionProfilingDigest = digests.decisionProfilingDigest;
        negotiationDigest = digests.negotiationDigest;
        if (domainInfluenceDigest) {
          layers.push('trip_domain_influence_digest');
        }
        if (wishConstraintDigest) {
          layers.push('trip_wish_constraint_digest');
        }
        if (privateWishDigest) {
          layers.push('trip_private_wish_digest');
        }
        if (decisionProfilingDigest) {
          layers.push('trip_decision_profiling_digest');
        }
        if (negotiationDigest) {
          layers.push('trip_negotiation_digest');
        }
      } catch (e: any) {
        this.logger.warn(`MemoryContextAssembler: trip intent digest failed: ${e?.message ?? e}`);
      }
    }

    const ctx: AgentMemoryContext = {
      snapshotId,
      snapshotVersion,
      requestId,
      userId,
      tripId,
      userProfile,
      travelPreference,
      routePartyProfile,
      recentDecisions,
      decisionLedger: drifted.ledger,
      ledgerRecomputePlan,
      recentWorldDecisions,
      activeTripState,
      recoveryHistory,
      failurePatterns: [],
      domainInfluenceDigest,
      wishConstraintDigest,
      privateWishDigest,
      decisionProfilingDigest,
      negotiationDigest,
      loadedAt,
      observability: { layers },
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

  private mergeTravelPreferenceSummary(
    profile: UserTravelProfile | null,
    routeParty: RouteRunPartyProfileSnapshot | null,
  ): Record<string, unknown> | null {
    const fromProfile = profile
      ? {
          pacePreference: profile.pacePreference,
          riskTolerance: profile.riskTolerance,
          travelPhilosophy: profile.travelPhilosophy,
          preferredRouteTypes: profile.preferredRouteTypes,
          confidence: profile.confidence,
        }
      : null;
    const fromRoute =
      routeParty &&
      (routeParty.fitness_level != null ||
        routeParty.risk_tolerance != null ||
        routeParty.party_total != null ||
        routeParty.has_children != null ||
        routeParty.has_elderly != null ||
        (typeof routeParty.mobility_note_zh === 'string' && routeParty.mobility_note_zh.trim().length > 0))
        ? {
            route_fitness_level: routeParty.fitness_level ?? null,
            route_risk_tolerance: routeParty.risk_tolerance ?? null,
            route_party_total: routeParty.party_total ?? null,
            route_has_children: routeParty.has_children ?? null,
            route_has_elderly: routeParty.has_elderly ?? null,
            route_mobility_note_zh: routeParty.mobility_note_zh?.trim() ?? null,
          }
        : null;
    if (!fromProfile && !fromRoute) return null;
    return { ...(fromProfile ?? {}), ...(fromRoute ?? {}) };
  }
}
