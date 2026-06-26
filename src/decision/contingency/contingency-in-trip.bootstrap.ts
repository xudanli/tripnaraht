import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ContingencyOrchestratorService } from './contingency-orchestrator.service';
import { ContingencyInTripHandler } from './handlers/contingency-in-trip.handler';

@Injectable()
export class ContingencyInTripBootstrap implements OnModuleInit {
  private readonly logger = new Logger(ContingencyInTripBootstrap.name);

  constructor(
    private readonly orchestrator: ContingencyOrchestratorService,
    private readonly inTripHandler: ContingencyInTripHandler,
  ) {}

  onModuleInit(): void {
    this.orchestrator.registerHandler({
      pathId: 'IN_TRIP_RECOVERY',
      trigger: (tripId, reason, metadata) => this.inTripHandler.handle(tripId, reason, metadata),
    });
    this.logger.log('[ContingencyOrchestrator] IN_TRIP_RECOVERY handler registered');
  }
}
