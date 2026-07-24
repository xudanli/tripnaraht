/**
 * RAG chunk → WorldConstraintStore（CGUS / 统一约束图前的 SSOT 落地）
 */

import type { ChunkRetrievalResult } from '../rag/services/chunk-retrieval.service';
import type { TripPlan } from '../trips/decision/plan-model';
import { WorldConstraintStore } from './world-constraint.store';
import { applyWorldEvent, type WorldDomainEvent } from './world-constraint.pipeline';
import { snapshotWorldConstraintStore, type WorldConstraintStoreSnapshot } from './world-snapshot';
import {
  worldEventsFromRagChunks,
  type RagChunksToWorldEventsOptions,
} from './rag-chunks-to-world-events.util';

export interface WorldConstraintMaterializationSummary {
  appliedEvents: number;
  roadIds: string[];
  weatherDates: string[];
  storeVersion: number;
  snapshot: WorldConstraintStoreSnapshot;
}

export interface MaterializeRagWorldConstraintsOptions extends RagChunksToWorldEventsOptions {
  tripPlan?: TripPlan;
  /** 在已有 store 上追加（默认新建空 store） */
  baseStore?: WorldConstraintStore;
}

/**
 * 将 RAG chunks 物化为 `WorldConstraintStore` 快照（唯一推荐写入路径：`applyWorldEvent`）。
 */
export function materializeRagChunksToWorldStore(
  chunks: ChunkRetrievalResult[],
  options?: MaterializeRagWorldConstraintsOptions,
): WorldConstraintMaterializationSummary | undefined {
  if (!chunks.length) return undefined;

  const events = worldEventsFromRagChunks(chunks, options);
  if (!events.length) return undefined;

  const store = options?.baseStore ?? new WorldConstraintStore();
  const roadIds = new Set<string>();
  const weatherDates = new Set<string>();

  for (const ev of events) {
    applyWorldEvent(store, ev, { tripPlan: options?.tripPlan });
    if (ev.kind === 'ROAD') roadIds.add(ev.roadId);
    if (ev.kind === 'WEATHER') weatherDates.add(ev.date);
  }

  return {
    appliedEvents: events.length,
    roadIds: [...roadIds],
    weatherDates: [...weatherDates],
    storeVersion: store.version,
    snapshot: snapshotWorldConstraintStore(store),
  };
}

/** 测试 / 回放：直接应用已解析事件列表 */
export function materializeWorldEventsToStore(
  events: WorldDomainEvent[],
  options?: { tripPlan?: TripPlan; baseStore?: WorldConstraintStore },
): WorldConstraintMaterializationSummary | undefined {
  if (!events.length) return undefined;
  const store = options?.baseStore ?? new WorldConstraintStore();
  const roadIds = new Set<string>();
  const weatherDates = new Set<string>();
  for (const ev of events) {
    applyWorldEvent(store, ev, { tripPlan: options?.tripPlan });
    if (ev.kind === 'ROAD') roadIds.add(ev.roadId);
    if (ev.kind === 'WEATHER') weatherDates.add(ev.date);
  }
  return {
    appliedEvents: events.length,
    roadIds: [...roadIds],
    weatherDates: [...weatherDates],
    storeVersion: store.version,
    snapshot: snapshotWorldConstraintStore(store),
  };
}
