import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContingencyOrchestratorService } from './contingency-orchestrator.service';
import { ContingencyAdvisorPlanBHandler } from './handlers/contingency-advisor-plan-b.handler';

@Injectable()
export class ContingencyGate1Bootstrap implements OnModuleInit {
  private readonly logger = new Logger(ContingencyGate1Bootstrap.name);

  constructor(
    private readonly orchestrator: ContingencyOrchestratorService,
    private readonly advisorPlanBHandler: ContingencyAdvisorPlanBHandler,
  ) {}

  onModuleInit(): void {
    this.orchestrator.registerHandler({
      pathId: 'ADVISOR_PLAN_B',
      trigger: (tripId, reason, metadata) => this.advisorPlanBHandler.handle(tripId, reason, metadata),
    });
    this.logger.log('[ContingencyOrchestrator] ADVISOR_PLAN_B handler registered');
  }
}
