import { Injectable } from '@nestjs/common';
import type { DecisionLogCognitiveSlice } from './user-cognitive-profile.types';

/** Nest 注入 token：可替换为 Prisma/Redis 实现，默认 NoOp。 */
export const MEMORY_COGNITIVE_SLICE_PROVIDER = Symbol('MEMORY_COGNITIVE_SLICE_PROVIDER');

export interface IMemoryCognitiveSliceProvider {
  /**
   * 拉取最近 `limit` 条认知切片（已投影、无 PII）；仅存储适配，不做聚合。
   * `subjectRef` 为不透明主语键（如 userId 或 hash），本层不解析语义。
   */
  loadRecentNarrateSlices(
    subjectRef: string,
    limit?: number,
  ): Promise<readonly DecisionLogCognitiveSlice[]>;
}

@Injectable()
export class NoOpMemoryCognitiveSliceProvider implements IMemoryCognitiveSliceProvider {
  async loadRecentNarrateSlices(): Promise<readonly DecisionLogCognitiveSlice[]> {
    return [];
  }
}
