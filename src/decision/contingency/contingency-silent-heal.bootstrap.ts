import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContingencyOrchestratorService } from './contingency-orchestrator.service';
import { ContingencySilentHealHandler } from './handlers/contingency-silent-heal.handler';

@Injectable()
export class ContingencySilentHealBootstrap implements OnModuleInit {
  private readonly logger = new Logger(ContingencySilentHealBootstrap.name);

  constructor(
    private readonly orchestrator: ContingencyOrchestratorService,
    private readonly silentHealHandler: ContingencySilentHealHandler,
  ) {}

  onModuleInit(): void {
    this.orchestrator.registerHandler({
      pathId: 'SILENT_HEAL',
      trigger: (tripId, reason, metadata) => this.silentHealHandler.handle(tripId, reason, metadata),
    });
    this.logger.log('[ContingencyOrchestrator] SILENT_HEAL handler registered');
  }
}
