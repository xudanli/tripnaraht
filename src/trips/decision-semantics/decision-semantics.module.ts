import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { SharedMemoryModule } from '../../agent/memory/shared-memory.module';
import { RagModule } from '../../rag/rag.module';
import { TripConstraintSolverModule } from '../trip-constraint-solver/trip-constraint-solver.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { DecisionProblemSsotModule } from '../../decision-runtime/decision-problems/decision-problem-ssot.module';
import { shouldUseUnifiedDecisionReadModel } from '../../decision-runtime/decision-problems/decision-problem-ssot.config';
import { CausalProtocolModule } from '../../causal-protocol/causal-protocol.module';
import { DecisionSemanticsController } from './controllers/decision-semantics.controller';
import { DecisionSemanticsL1Controller } from './controllers/decision-semantics-l1.controller';
import { DecisionSemanticsService } from './services/decision-semantics.service';
import { DecisionProblemCollectorService } from './collectors/decision-problem.collector';
import { DecisionRepairExecutorService } from './services/decision-repair-executor.service';
import { DecisionOutcomeValidationService } from './services/decision-outcome-validation.service';
import { DecisionRecordStoreService } from './persistence/decision-record.store';
import { DecisionLedgerBridgeService } from './ledger/decision-ledger-bridge.service';
import { DestinationInsightService } from './services/destination-insight.service';

@Module({
  imports: [
    PrismaModule,
    SharedMemoryModule,
    forwardRef(() => TripConstraintSolverModule),
    forwardRef(() => RagModule),
    DecisionProblemSsotModule,
    EffectivePlanExecutionModule,
    forwardRef(() => CausalProtocolModule),
  ],
  controllers: shouldUseUnifiedDecisionReadModel()
    ? [DecisionSemanticsL1Controller]
    : [DecisionSemanticsController],
  providers: [
    DecisionSemanticsService,
    DecisionProblemCollectorService,
    DecisionRecordStoreService,
    DecisionRepairExecutorService,
    DecisionOutcomeValidationService,
    DecisionLedgerBridgeService,
    DestinationInsightService,
  ],
  exports: [
    DecisionSemanticsService,
    DestinationInsightService,
    DecisionProblemCollectorService,
    DecisionRepairExecutorService,
    DecisionOutcomeValidationService,
    DecisionLedgerBridgeService,
    DecisionRecordStoreService,
  ],
})
export class DecisionSemanticsModule {}
