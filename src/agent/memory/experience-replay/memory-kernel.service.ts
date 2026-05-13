import { Inject, Injectable, Optional } from '@nestjs/common';
import { deriveUserCognitiveProfileFromDecisionSignals } from './decision-log-cognitive-signals.util';
import { MEMORY_KERNEL_LOAD_BUDGET_MS, MEMORY_KERNEL_SLICE_FETCH_LIMIT } from './memory-replay.constants';
import {
  MEMORY_COGNITIVE_SLICE_PROVIDER,
  type IMemoryCognitiveSliceProvider,
} from './memory-cognitive-slice.provider';
import type { DecisionLogCognitiveSlice, UserCognitiveProfile } from './user-cognitive-profile.types';

const NOOP_SLICE_PROVIDER: IMemoryCognitiveSliceProvider = {
  async loadRecentNarrateSlices() {
    return [];
  },
};

/**
 * 4.0 MemoryKernel：在 `MEMORY_KERNEL_LOAD_BUDGET_MS` 内完成「切片拉取 → 确定性聚合」；
 * 超时或零证据时返回 `null`，上层走 3.0 无记忆路径。
 */
@Injectable()
export class MemoryKernelService {
  constructor(
    @Optional()
    @Inject(MEMORY_COGNITIVE_SLICE_PROVIDER)
    private readonly sliceProvider?: IMemoryCognitiveSliceProvider,
  ) {}

  async loadProfileForSubject(subjectRef: string): Promise<UserCognitiveProfile | null> {
    const ref = subjectRef?.trim();
    if (!ref) return null;
    const provider = this.sliceProvider ?? NOOP_SLICE_PROVIDER;

    type RaceOk = { kind: 'ok'; slices: readonly DecisionLogCognitiveSlice[] };
    type RaceTimeout = { kind: 'timeout' };
    const budgetMs = MEMORY_KERNEL_LOAD_BUDGET_MS;

    const raced = await Promise.race<RaceOk | RaceTimeout>([
      provider.loadRecentNarrateSlices(ref, MEMORY_KERNEL_SLICE_FETCH_LIMIT).then((slices) => ({ kind: 'ok' as const, slices })),
      new Promise<RaceTimeout>((resolve) => {
        setTimeout(() => resolve({ kind: 'timeout' }), budgetMs);
      }),
    ]);

    if (raced.kind === 'timeout') return null;

    const profile = deriveUserCognitiveProfileFromDecisionSignals(ref, [...raced.slices], {
      maxLookback: 50,
    });
    if (profile.evidence_weight === 0) return null;
    return profile;
  }
}
