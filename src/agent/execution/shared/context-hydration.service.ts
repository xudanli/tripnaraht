import { Injectable } from '@nestjs/common';
import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import type { PhaseExecutorContext } from '../../../decision/kernel/interfaces/phase-executor.interface';
import { ContextRetriever } from './context-retriever.util';
import {
  hydrateTripPlanTransportEndpoints,
  normalizeHydratedTransportEndpoint,
  resolveGeographicEndpointFromHistory,
  type HydrateTransportOptions,
  type TransportEndpointHydrationResult,
} from './transport-endpoint-hydration.util';

/**
 * 决策上下文回填：将自然语言指代词解析为可执行证据链所需的具体字段（首期：行程 transport 端点）。
 */
@Injectable()
export class ContextHydrationService {
  /**
   * 在 transport.search 前调用：若 trip 中为「起点/终点」等占位，尝试用 DSO.userIntent 补全。
   */
  hydrateTripPlanForTransport(
    dso: DecisionState,
    trip: PhaseExecutorContext['tripPlanRequest'] | undefined,
    opts?: HydrateTransportOptions,
  ): TransportEndpointHydrationResult {
    return hydrateTripPlanTransportEndpoints(dso, trip, opts);
  }

  /**
   * 解析指代词端点：优先 DSO.userIntent，再按时间倒序检索 history 中的结构化快照。
   * 返回的字符串若为 lat,lng 形态会由 `normalizeTransportEndpointsForSkill` 再归一为坐标对象。
   */
  resolveGeographicEntity(
    dso: DecisionState,
    role: 'origin' | 'destination',
    recentMessages?: string[],
  ): string | { lat: number; lng: number } | undefined {
    const intent = dso.userIntent ?? {};
    const raw = role === 'origin' ? intent.origin : intent.destination;
    const fromIntent = normalizeHydratedTransportEndpoint(raw, role);
    if (fromIntent !== undefined) return fromIntent;
    return (
      resolveGeographicEndpointFromHistory(dso, role) ??
      ContextRetriever.findLastResolvedCoordinateFromMessages(recentMessages, role)
    );
  }
}
