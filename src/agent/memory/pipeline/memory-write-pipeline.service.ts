// src/agent/memory/pipeline/memory-write-pipeline.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { MemoryService } from '../services/memory.service';
import { AGENT_MEMORY_DECISION_COMPLETED } from '../events/agent-memory.events';
import type { AgentMemoryDecisionCompletedPayload } from '../events/agent-memory-event.schema';
import { isAgentMemoryDecisionCompletedPayload } from '../events/agent-memory-event.schema';
import { PrometheusMetricsService } from '../../../monitoring/prometheus-metrics.service';

/**
 * 记忆写入总线：业务只 emit，统一落库 L1/L2/…，避免散落的 saveXXX 与 schema 漂移。
 */
@Injectable()
export class MemoryWritePipelineService {
  private readonly logger = new Logger(MemoryWritePipelineService.name);

  constructor(
    private readonly memoryService: MemoryService,
    @Optional() private readonly prom?: PrometheusMetricsService,
  ) {}

  @OnEvent(AGENT_MEMORY_DECISION_COMPLETED)
  async onDecisionCompleted(payload: AgentMemoryDecisionCompletedPayload): Promise<void> {
    if (!payload || !isAgentMemoryDecisionCompletedPayload(payload)) {
      return;
    }
    try {
      const { kind: _k, ...memory } = payload;
      await this.memoryService.saveRouteDirectionDecision(memory);
      this.prom?.recordMemoryPipelineWrite('success');
      this.logger.debug(
        `MemoryWritePipeline: persisted L2 route_direction decision user=${memory.userId} trip=${memory.tripId ?? 'n/a'}`,
      );
    } catch (e: any) {
      this.prom?.recordMemoryPipelineWrite('failure');
      this.logger.warn(`MemoryWritePipeline: L2 persist failed: ${e?.message ?? e}`);
    }
  }
}
