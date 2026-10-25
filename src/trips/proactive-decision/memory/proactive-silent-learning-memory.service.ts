/**
 * Phase 4 P1 — Nest adapter: Silent Learning → Travel Memory Runtime.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { TravelMemoryRuntimeService } from '../../../travel-memory/runtime/travel-memory-runtime.service';
import { isProactiveDecisionV1Enabled } from '../config/proactive-decision-feature-flags.util';
import type { ProactiveSilentLearningV1 } from '../intervention/proactive-silent-learning.types';
import type { ProactiveDecisionTraceV1 } from '../trace/proactive-decision-trace.types';
import type { ProactiveOptionId } from '../synthesis/proactive-synthesis.types';
import { toProactiveDecisionTraceReplayJson } from '../trace/build-proactive-decision-trace.util';
import {
  ingestProactiveSilentLearningIntoMemoryLedger,
  type IngestProactiveSilentLearningResult,
} from './ingest-proactive-silent-learning.util';

export function isProactiveSilentLearningMemoryEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isProactiveDecisionV1Enabled(env)) return false;
  const raw = env.PROACTIVE_SILENT_LEARNING_MEMORY_ENABLED?.trim().toLowerCase();
  // Default ON when PD V1 on — product: threshold tuning needs this early
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return true;
}

@Injectable()
export class ProactiveSilentLearningMemoryService {
  private readonly logger = new Logger(
    ProactiveSilentLearningMemoryService.name,
  );

  constructor(
    @Optional() private readonly travelMemory?: TravelMemoryRuntimeService,
  ) {}

  ingest(input: {
    silentLearning: ProactiveSilentLearningV1;
    decisionProblemId?: string | null;
    recommendedOptionId?: ProactiveOptionId | null;
    decisionTrace?: ProactiveDecisionTraceV1 | null;
    env?: NodeJS.ProcessEnv;
  }): IngestProactiveSilentLearningResult & {
    silentLearning: ProactiveSilentLearningV1;
  } {
    const env = input.env ?? process.env;
    if (!isProactiveSilentLearningMemoryEnabled(env)) {
      return {
        ok: false,
        reason: 'PROACTIVE_SILENT_LEARNING_MEMORY_ENABLED off',
        memoryHook: 'TRAVEL_MEMORY_PENDING',
        silentLearning: input.silentLearning,
      };
    }

    if (!this.travelMemory) {
      this.logger.warn('TravelMemoryRuntimeService unavailable — skip silent ingest');
      return {
        ok: false,
        reason: 'travel_memory_runtime_unavailable',
        memoryHook: 'TRAVEL_MEMORY_SKIPPED',
        silentLearning: {
          ...input.silentLearning,
          memoryHook: 'TRAVEL_MEMORY_SKIPPED',
        },
      };
    }

    const result = ingestProactiveSilentLearningIntoMemoryLedger({
      ledger: this.travelMemory.getLedger(),
      silentLearning: input.silentLearning,
      decisionProblemId: input.decisionProblemId,
      recommendedOptionId: input.recommendedOptionId,
      decisionTraceReplay: input.decisionTrace
        ? toProactiveDecisionTraceReplayJson(input.decisionTrace)
        : null,
    });

    const silentLearning: ProactiveSilentLearningV1 = {
      ...input.silentLearning,
      memoryHook: result.memoryHook,
      memoryEventId: result.ok ? result.event.memoryEventId : undefined,
    };

    if (result.ok) {
      this.logger.debug(
        `PD silent→memory trip=${silentLearning.tripId} signal=${silentLearning.signalEventId} dup=${result.duplicate}`,
      );
    } else if (result.ok === false) {
      this.logger.warn(
        `PD silent→memory failed trip=${silentLearning.tripId}: ${result.reason}`,
      );
    }

    return { ...result, silentLearning };
  }
}
