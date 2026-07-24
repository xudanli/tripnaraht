import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WorldStateSnapshotModule } from '../decision-runtime/snapshot/world-state-snapshot.module';
import { DecisionGatewayModule } from '../decision-runtime/gateway/decision-gateway.module';
import { ExplorationModule } from '../trips/exploration/exploration.module';
import { TravelContextController } from './travel-context.controller';
import { TravelContextProjectionResolverService } from './projections/travel-context-projection-resolver.service';
import { ExplorationContextAdapter } from './snapshot/adapters/exploration-context.adapter';
import { TripContextAdapterService } from './snapshot/adapters/trip-context.adapter.service';
import { TravelContextResolverService } from './snapshot/travel-context-resolver.service';
import { TravelContextSnapshotBuilderService } from './snapshot/travel-context-snapshot-builder.service';
import { TravelContextRevisionService } from './snapshot/travel-context-revision.service';
import { TravelContextIntentService } from './intents/travel-context-intent.service';
import { TravelContextDiffService } from './diff/travel-context-diff.service';
import { TravelContextRevisionJournalService } from './diff/travel-context-revision-journal.service';
import { TravelContextRevisionHubService } from './diff/travel-context-revision-hub.service';
import { TravelContextEventsStreamService } from './events/travel-context-events-stream.service';
import { TravelContextAgentBindingService } from './agent/travel-context-agent-binding.service';
import { TravelContextSnapshotArchiveService } from './snapshot/travel-context-snapshot-archive.service';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WorldStateSnapshotModule,
    forwardRef(() => DecisionGatewayModule),
    ExplorationModule,
  ],
  controllers: [TravelContextController],
  providers: [
    TravelContextResolverService,
    TravelContextRevisionService,
    TravelContextSnapshotBuilderService,
    ExplorationContextAdapter,
    TripContextAdapterService,
    TravelContextProjectionResolverService,
    TravelContextIntentService,
    TravelContextDiffService,
    TravelContextRevisionJournalService,
    TravelContextRevisionHubService,
    TravelContextEventsStreamService,
    TravelContextAgentBindingService,
    TravelContextSnapshotArchiveService,
  ],
  exports: [
    TravelContextResolverService,
    TravelContextRevisionService,
    TravelContextSnapshotBuilderService,
    TripContextAdapterService,
    TravelContextProjectionResolverService,
    TravelContextIntentService,
    TravelContextDiffService,
    TravelContextRevisionHubService,
    TravelContextAgentBindingService,
    TravelContextSnapshotArchiveService,
  ],
})
export class TravelContextModule {}
