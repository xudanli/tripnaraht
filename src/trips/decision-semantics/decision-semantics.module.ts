import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedMemoryModule } from '../../agent/memory/shared-memory.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { isDecisionGatewayUnifiedEnabled } from '../../decision-runtime/gateway/config/decision-gateway.config';
import { DecisionSemanticsController } from './controllers/decision-semantics.controller';
import { DecisionSemanticsL1Controller } from './controllers/decision-semantics-l1.controller';
import { DecisionSemanticsService } from './services/decision-semantics.service';
import { DecisionProblemCollectorService } from './collectors/decision-problem.collector';
import { DecisionRepairExecutorService } from './services/decision-repair-executor.service';
import { DecisionOutcomeValidationService } from './services/decision-outcome-validation.service';
import { DecisionRecordStoreService } from './persistence/decision-record.store';
import { DecisionLedgerBridgeService } from './ledger/decision-ledger-bridge.service';

@Module({
  imports: [PrismaModule, SharedMemoryModule, forwardRef(() => TripConstraintSolverModule)],
  controllers: isDecisionGatewayUnifiedEnabled()
    ? [DecisionSemanticsL1Controller]
    : [DecisionSemanticsController],
  providers: [
    DecisionSemanticsService,
    DecisionProblemCollectorService,
    DecisionRecordStoreService,
    DecisionRepairExecutorService,
    DecisionOutcomeValidationService,
    DecisionLedgerBridgeService,
  ],
  exports: [
    DecisionSemanticsService,
    DecisionProblemCollectorService,
    DecisionRepairExecutorService,
    DecisionOutcomeValidationService,
    DecisionLedgerBridgeService,
    DecisionRecordStoreService,
  ],
})
export class DecisionSemanticsModule {}
