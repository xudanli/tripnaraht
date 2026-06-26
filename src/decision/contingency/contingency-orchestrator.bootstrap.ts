import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContingencyOrchestratorService } from './contingency-orchestrator.service';
import { ReplanCoordinatorService } from '../../trips/decision/services/replan-coordinator.service';

@Injectable()
export class ContingencyOrchestratorBootstrap implements OnModuleInit {
  private readonly logger = new Logger(ContingencyOrchestratorBootstrap.name);

  constructor(
    private readonly orchestrator: ContingencyOrchestratorService,
    private readonly replanCoordinator: ReplanCoordinatorService,
  ) {}

  onModuleInit(): void {
    this.orchestrator.registerHandler({
      pathId: 'KERNEL_REPLAN',
      trigger: async (tripId, reason) => {
        await this.replanCoordinator.runKernelReplan(tripId, reason);
      },
    });
    this.logger.log('[ContingencyOrchestrator] KERNEL_REPLAN handler registered');
  }
}
