import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GuardianDecisionCoreModule } from '../../trips/guardian-decision-core/guardian-decision-core.module';
import { DecisionGatewayModule } from '../gateway/decision-gateway.module';
import { TripConstraintSolverModule } from '../../trips/trip-constraint-solver/trip-constraint-solver.module';
import { TravelCompilerModule } from '../../travel-compiler/travel-compiler.module';
import { TravelOntologyModule } from '../../travel-ontology/travel-ontology.module';
import { WorldStateSnapshotService } from './world-state-snapshot.service';
import { TripContextSnapshotAssemblerService } from './trip-context-snapshot.assembler.service';
import { TripContextSnapshotController } from './trip-context-snapshot.controller';
import { SnapshotTriggerEnrichmentService } from './snapshot-trigger-enrichment.service';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => GuardianDecisionCoreModule),
    forwardRef(() => TripConstraintSolverModule),
    forwardRef(() => DecisionGatewayModule),
    forwardRef(() => TravelCompilerModule),
    TravelOntologyModule,
  ],
  controllers: [TripContextSnapshotController],
  providers: [
    WorldStateSnapshotService,
    TripContextSnapshotAssemblerService,
    SnapshotTriggerEnrichmentService,
  ],
  exports: [
    WorldStateSnapshotService,
    TripContextSnapshotAssemblerService,
    SnapshotTriggerEnrichmentService,
  ],
})
export class WorldStateSnapshotModule {}
