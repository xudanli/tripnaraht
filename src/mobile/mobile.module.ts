import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { TripsModule } from '../trips/trips.module';
import { AttractionExploreModule } from '../trips/attraction-explore/attraction-explore.module';
import { ContextualRecommendationsModule } from '../trips/contextual-recommendations/contextual-recommendations.module';
import { WorldStateSnapshotModule } from '../decision-runtime/snapshot/world-state-snapshot.module';
import { DecisionGatewayModule } from '../decision-runtime/gateway/decision-gateway.module';
import { TravelStatusModule } from '../trips/travel-status/travel-status.module';
import { InTripExecutionModule } from '../trips/in-trip-execution/in-trip-execution.module';
import { TripConstraintSolverModule } from '../trips/trip-constraint-solver/trip-constraint-solver.module';
import { ArrangeItineraryModule } from '../trips/arrange-itinerary/arrange-itinerary.module';
import { ExecutionRiskCenterModule } from '../trips/execution-risk-center/execution-risk-center.module';
import { GuardianDecisionCoreModule } from '../trips/guardian-decision-core/guardian-decision-core.module';
import { MobileExecutionController } from './controllers/mobile-execution.controller';
import { MobilePlanningController } from './controllers/mobile-planning.controller';
import { MobileUserController } from './controllers/mobile-user.controller';
import { MobileTripCredentialsController } from './controllers/mobile-trip-credentials.controller';
import { TripsMobileCompatController } from './controllers/trips-mobile-compat.controller';
import { MobileExecutionService } from './services/mobile-execution.service';
import { MobilePlanningService } from './services/mobile-planning.service';
import { MobileSpatialRouteService } from './services/mobile-spatial-route.service';
import { MobileExecutionWriteService } from './services/mobile-execution-write.service';
import { MobileDailyDriveService } from './services/mobile-daily-drive.service';
import { MobileInTripHomeService } from './services/mobile-in-trip-home.service';
import { MobileOverviewDashboardService } from './services/mobile-overview-dashboard.service';
import { MobileExecutionQuickActionsService } from './services/mobile-execution-quick-actions.service';
import { MobileEmergencyContactsService } from './services/mobile-emergency-contacts.service';
import { MobileEmergencyPackService } from './services/mobile-emergency-pack.service';
import { MobilePushTokenService } from './services/mobile-push-token.service';
import { MobileApnsService } from './services/mobile-apns.service';
import { MobilePushNotificationService } from './services/mobile-push-notification.service';
import { MobileCredentialDocumentsService } from './services/mobile-credential-documents.service';
import { MobileCredentialDocumentStorageService } from './services/mobile-credential-document-storage.service';
import { MobileCredentialStatusService } from './services/mobile-credential-status.service';
import { UserPreferencesOtherStore } from './services/user-preferences-other.store';
import { MobileIdentityService } from './services/mobile-identity.service';
import { MobileIdentityOptionsService } from './services/mobile-identity-options.service';
import { MobileTravelPortraitService } from './services/mobile-travel-portrait.service';
import { MobileDriverProfileService } from './services/mobile-driver-profile.service';
import { TripContextWebSocketService } from './ws/trip-context-ws.service';
import { TripContextChangeNotifierService } from './ws/trip-context-change-notifier.service';
import { CountriesModule } from '../countries/countries.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    TripsModule,
    AttractionExploreModule,
    ContextualRecommendationsModule,
    WorldStateSnapshotModule,
    DecisionGatewayModule,
    TravelStatusModule,
    InTripExecutionModule,
    TripConstraintSolverModule,
    ArrangeItineraryModule,
    ExecutionRiskCenterModule,
    GuardianDecisionCoreModule,
    CountriesModule,
  ],
  controllers: [
    MobileExecutionController,
    MobilePlanningController,
    MobileUserController,
    MobileTripCredentialsController,
    TripsMobileCompatController,
  ],
  providers: [
    MobileExecutionService,
    MobilePlanningService,
    MobileSpatialRouteService,
    MobileExecutionWriteService,
    MobileDailyDriveService,
    MobileInTripHomeService,
    MobileOverviewDashboardService,
    MobileExecutionQuickActionsService,
    MobileEmergencyContactsService,
    MobileEmergencyPackService,
    MobilePushTokenService,
    MobileApnsService,
    MobilePushNotificationService,
    MobileCredentialDocumentsService,
    MobileCredentialDocumentStorageService,
    MobileCredentialStatusService,
    UserPreferencesOtherStore,
    MobileIdentityService,
    MobileIdentityOptionsService,
    MobileTravelPortraitService,
    MobileDriverProfileService,
    TripContextWebSocketService,
    TripContextChangeNotifierService,
  ],
  exports: [
    MobileExecutionService,
    MobilePlanningService,
    MobileSpatialRouteService,
    MobileExecutionWriteService,
    MobileDailyDriveService,
    MobileInTripHomeService,
    MobileOverviewDashboardService,
    MobileExecutionQuickActionsService,
    MobileEmergencyContactsService,
    MobilePushNotificationService,
    TripContextChangeNotifierService,
    MobileCredentialDocumentsService,
    MobileCredentialStatusService,
    MobileIdentityService,
    MobileTravelPortraitService,
    MobileDriverProfileService,
  ],
})
export class MobileModule {}
