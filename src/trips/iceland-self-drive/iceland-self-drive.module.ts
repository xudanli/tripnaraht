import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { EffectivePlanExecutionModule } from '../../decision-runtime/execution/effective-plan-execution.module';
import { ConstraintEvaluationModule } from '../../decision-runtime/constraints/constraint-evaluation.module';
import { UnifiedConstraintAssessmentModule } from '../../decision-runtime/constraints/unified-constraint-assessment.module';
import { DecisionCasesModule } from '../../decision-runtime/decision-cases/decision-cases.module';
import { IcelandSelfDriveCatalogService } from './services/iceland-self-drive-catalog.service';
import { IcelandRegionPlanningPackService } from './services/iceland-region-planning-pack.service';
import { IcelandGoldenSetCatalogResolver } from './services/iceland-golden-set-catalog-resolver.service';
import { IcelandInitialPlanSeedService } from './services/iceland-initial-plan-seed.service';
import { IcelandInitialPlanArrangeProjector } from './services/iceland-initial-plan-arrange-projector.service';
import { IcelandInitialPlanPipelineService } from './services/iceland-initial-plan-pipeline.service';
import { IcelandTripCreateOrchestrator } from './services/iceland-trip-create.orchestrator';
import { IcelandInitialPlanProposalStore } from './services/iceland-initial-plan-proposal.store';
import { IcelandInitialPlanPreflightService } from './services/iceland-initial-plan-preflight.service';
import { IcelandShadowUnifiedAssessmentService } from './services/iceland-shadow-unified-assessment.service';
import { IcelandInitialPlanRepairOnceService } from './services/iceland-initial-plan-repair-once.service';
import { IcelandInitialPlanVerificationBridgeService } from './services/iceland-initial-plan-verification-bridge.service';
import { IcelandTripShellRepository } from './services/iceland-trip-shell.repository';
import { IcelandStoredProposalRepository } from './services/iceland-stored-proposal.repository';
import { IcelandAppliedPlanRepository } from './services/iceland-applied-plan.repository';
import { IcelandInitialPlanPrismaApplyService } from './services/iceland-initial-plan-prisma-apply.service';
import { IcelandInitialPlanPreviewService } from './services/iceland-initial-plan-preview.service';
import { IcelandShadowVsPlatformContrastService } from './services/iceland-shadow-vs-platform-contrast.service';
import { IcelandInitialPlanPreviewController } from './iceland-initial-plan-preview.controller';
import { IcelandSelfDriveCatalogController } from './iceland-self-drive-catalog.controller';
import { IcelandSelfDriveDrivingSettingsController } from './iceland-self-drive-driving-settings.controller';
import { IcelandSelfDriveBootstrapController } from './iceland-self-drive-bootstrap.controller';
import { IcelandInitialPlanPreviewDemoController } from './iceland-initial-plan-preview-demo.controller';
import { IcelandSelfDriveBookablePlacesService } from './services/iceland-self-drive-bookable-places.service';
import { IcelandSelfDriveDrivingSettingsService } from './services/iceland-self-drive-driving-settings.service';
import { IcelandShellDrivingSettingsService } from './services/iceland-shell-driving-settings.service';
import { IcelandSelfDriveBootstrapService } from './services/iceland-self-drive-bootstrap.service';

/**
 * Iceland self-drive — Trip Shell + Initial Plan Preview / Confirm / Apply HTTP.
 * Apply writes Prisma Trip/Items + Iceland PlanVersion audit under EffectivePlanWriter.
 * Shadow vs platform contrast is calibration-only (does not own Confirm/Apply).
 * Gateway + UnifiedAssessment injected for contrast enrichment / post-Apply bundle.
 */
@Module({
  imports: [
    PrismaModule,
    EffectivePlanExecutionModule,
    forwardRef(() => ConstraintEvaluationModule),
    UnifiedConstraintAssessmentModule,
    forwardRef(() => DecisionCasesModule),
  ],
  controllers: [
    IcelandInitialPlanPreviewController,
    IcelandSelfDriveCatalogController,
    IcelandSelfDriveDrivingSettingsController,
    IcelandSelfDriveBootstrapController,
    IcelandInitialPlanPreviewDemoController,
  ],
  providers: [
    IcelandSelfDriveCatalogService,
    IcelandSelfDriveBookablePlacesService,
    IcelandSelfDriveDrivingSettingsService,
    IcelandShellDrivingSettingsService,
    IcelandSelfDriveBootstrapService,
    IcelandRegionPlanningPackService,
    IcelandGoldenSetCatalogResolver,
    IcelandInitialPlanSeedService,
    IcelandInitialPlanArrangeProjector,
    IcelandInitialPlanPipelineService,
    IcelandInitialPlanProposalStore,
    IcelandInitialPlanPreflightService,
    IcelandShadowUnifiedAssessmentService,
    IcelandInitialPlanRepairOnceService,
    IcelandInitialPlanVerificationBridgeService,
    IcelandTripCreateOrchestrator,
    IcelandTripShellRepository,
    IcelandStoredProposalRepository,
    IcelandAppliedPlanRepository,
    IcelandInitialPlanPrismaApplyService,
    IcelandInitialPlanPreviewService,
    IcelandShadowVsPlatformContrastService,
  ],
  exports: [
    IcelandSelfDriveCatalogService,
    IcelandSelfDriveBookablePlacesService,
    IcelandRegionPlanningPackService,
    IcelandInitialPlanSeedService,
    IcelandInitialPlanPipelineService,
    IcelandTripCreateOrchestrator,
    IcelandInitialPlanProposalStore,
    IcelandInitialPlanVerificationBridgeService,
    IcelandInitialPlanPreviewService,
    IcelandTripShellRepository,
    IcelandStoredProposalRepository,
    IcelandAppliedPlanRepository,
    IcelandInitialPlanPrismaApplyService,
    IcelandShadowVsPlatformContrastService,
  ],
})
export class IcelandSelfDriveModule {}
