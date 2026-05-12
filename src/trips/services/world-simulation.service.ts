import { Injectable } from '@nestjs/common';
import type { DraftDay } from '../dto/trip-draft.dto';
import {
  analyzeWorldEventImpact,
  createInitialWorldState,
  extractPlanSlotsFromDraftDays,
  reduceWorldState,
} from '../draft-synthesis/world-simulation';
import type { ImpactAnalysisResult } from '../draft-synthesis/world-simulation/impact-analysis.types';
import type { PartialReplanRequest, PartialReplanScopeMode } from '../draft-synthesis/world-simulation/partial-replan.types';
import type { WorldEvent } from '../draft-synthesis/world-simulation/world-event.types';
import type { WorldState } from '../draft-synthesis/world-simulation/world-state.types';

/**
 * 按行程维护 WorldState，并驱动影响分析 / 局部重规划契约（内存骨架）。
 */
@Injectable()
export class WorldSimulationService {
  private readonly byTrip = new Map<string, WorldState>();

  getWorldState(tripId: string): WorldState {
    const s = this.byTrip.get(tripId);
    return s ? (JSON.parse(JSON.stringify(s)) as WorldState) : createInitialWorldState();
  }

  resetTrip(tripId: string): void {
    this.byTrip.delete(tripId);
  }

  /** 仅折叠事件，不做计划分析 */
  applyEvent(tripId: string, event: WorldEvent): WorldState {
    const prev = this.byTrip.get(tripId) ?? createInitialWorldState();
    const next = reduceWorldState(prev, event);
    this.byTrip.set(tripId, next);
    return this.getWorldState(tripId);
  }

  /**
   * 摄入事件、更新世界状态，并对当前草案做影响分析（供局部重跑 Repair / Orchestrator）。
   */
  ingestEventAndAnalyze(tripId: string, event: WorldEvent, draftDays: DraftDay[]): {
    worldState: WorldState;
    impact: ImpactAnalysisResult;
  } {
    const prev = this.byTrip.get(tripId) ?? createInitialWorldState();
    const worldState = reduceWorldState(prev, event);
    this.byTrip.set(tripId, worldState);

    const planSlots = extractPlanSlotsFromDraftDays(draftDays);
    const totalDays =
      draftDays.length > 0 ? Math.max(...draftDays.map((d) => d.day), draftDays.length) : 1;

    const impact = analyzeWorldEventImpact(event, {
      planSlots,
      totalDays,
      worldState,
    });

    return {
      worldState: JSON.parse(JSON.stringify(worldState)) as WorldState,
      impact,
    };
  }

  /** 构造 Partial Replan 占位请求（真正重跑由 TripDraftService / Runtime 接入） */
  buildPartialReplanRequest(
    tripId: string,
    impact: ImpactAnalysisResult,
    scopeMode: PartialReplanScopeMode = 'affected-and-downstream',
    triggerEventId?: string,
  ): PartialReplanRequest {
    return {
      tripId,
      impact,
      scopeMode,
      triggerEventId,
    };
  }
}
