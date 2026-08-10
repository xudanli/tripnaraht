/**
 * Travel Context Assembler — Decision Runtime 选择性消费 Memory 的入口。
 *
 * 不替换 MemoryContextAssemblerService（旧 OS 主路径保留）。
 * - shadow：装配结果挂观测
 * - consume：装配 + prepare 侧门控注入 DecisionHints（contribution.used 仍为 false）
 *
 * 环境变量：TRAVEL_CONTEXT_ASSEMBLY=off|1|shadow|consume
 * 可选：TRAVEL_CONTEXT_CONSUME_TASKS（任务 allowlist 正则）
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TravelMemoryRuntimeService } from '../runtime/travel-memory-runtime.service';
import {
  assembleTravelContext,
  type AssembleTravelContextInput,
} from './assemble-travel-context.util';
import type { AssembledTravelContextV1 } from './assembled-context.types';

export type TravelContextAssemblyMode = 'off' | 'shadow' | 'consume';

export function resolveTravelContextAssemblyModeFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): TravelContextAssemblyMode {
  const raw = String(env.TRAVEL_CONTEXT_ASSEMBLY ?? '')
    .trim()
    .toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'shadow') return 'shadow';
  if (raw === 'consume') return 'consume';
  return 'off';
}

@Injectable()
export class TravelContextAssemblerService {
  private readonly logger = new Logger(TravelContextAssemblerService.name);

  constructor(
    @Optional() private readonly travelMemory?: TravelMemoryRuntimeService,
  ) {}

  getMode(): TravelContextAssemblyMode {
    return resolveTravelContextAssemblyModeFromEnv();
  }

  isEnabled(): boolean {
    return this.getMode() !== 'off' && !!this.travelMemory;
  }

  /**
   * 装配并列 Context。失败返回 null，不阻断主路径。
   */
  assemble(
    input: Omit<AssembleTravelContextInput, 'ledger' | 'mode'> & {
      mode?: 'SHADOW' | 'CONSUME';
    },
  ): AssembledTravelContextV1 | null {
    if (!this.travelMemory) return null;
    const envMode = this.getMode();
    if (envMode === 'off') return null;

    try {
      const mode =
        input.mode ??
        (envMode === 'consume' ? 'CONSUME' : 'SHADOW');
      const episodes =
        input.episodes ??
        (input.tripId
          ? this.travelMemory.getRelevantDecisions({
              tripId: input.tripId,
              limit: 8,
            })
          : []);

      const assembled = assembleTravelContext({
        ...input,
        episodes,
        ledger: this.travelMemory.getLedger(),
        mode,
      });

      this.logger.debug(
        `[ContextAssembly] mode=${assembled.mode} task=${assembled.task} ` +
          `memorySafe=${assembled.memoryDecisionSafe} ` +
          `providers=${assembled.slices.filter((s) => s.included).map((s) => s.provider).join(',')}`,
      );
      return assembled;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`[ContextAssembly] assemble skipped: ${msg}`);
      return null;
    }
  }

  /** 观测摘要（挂 tick / DSO，避免塞全量） */
  toObservability(ctx: AssembledTravelContextV1): Record<string, unknown> {
    return {
      schemaId: ctx.schemaId,
      mode: ctx.mode,
      task: ctx.task,
      memoryDecisionSafe: ctx.memoryDecisionSafe,
      providersIncluded: ctx.slices.filter((s) => s.included).map((s) => s.provider),
      memoryEpisodeCount: ctx.memory?.relevantEpisodes.length ?? 0,
      memoryConflicts: ctx.memory?.conflicts.length ?? 0,
      contractConstraints: ctx.decisionContract?.constraints ?? [],
      selfDriveKeys: ctx.selfDriveWorld?.keys ?? [],
      shadowBaselineMemoryOmitted: ctx.shadowBaseline.memoryOmitted,
      deny: ctx.contract.deny,
    };
  }
}
