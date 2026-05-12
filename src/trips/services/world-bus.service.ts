import { Injectable, Logger, Optional } from '@nestjs/common';
import type { GlobalWorldState, WorldBusEvent } from '../draft-synthesis/autonomous-world';
import { WorldOrchestratorService } from './world-orchestrator.service';
import { WorldBusEventLogService } from './world-bus-event-log.service';

/**
 * 世界总线唯一写入口：所有 HTTP / Draft / Execution 应通过此处折叠进全局状态与城市孪生。
 */
@Injectable()
export class WorldBusService {
  private readonly logger = new Logger(WorldBusService.name);

  constructor(
    private readonly orchestrator: WorldOrchestratorService,
    @Optional() private readonly eventLog?: WorldBusEventLogService,
  ) {}

  emit(event: WorldBusEvent): GlobalWorldState {
    const state = this.orchestrator.ingestWorldBusEvent(event);
    if (this.eventLog) {
      void this.eventLog.append(event).catch((e: unknown) => {
        this.logger.warn(`WorldBusEventLog append failed: ${e instanceof Error ? e.message : String(e)}`);
      });
    }
    return state;
  }
}
