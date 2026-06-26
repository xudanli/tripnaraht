import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { Gate1Module } from '../gate1/gate1.module';
import { AdminStrictAuthGuard } from '../admin/guards/admin-strict-auth.guard';
import { AccountContextController } from './controllers/account-context.controller';
import { VerificationController } from './controllers/verification.controller';
import { PublishingPermissionController } from './controllers/publishing-permission.controller';
import { ProfessionalController } from './controllers/professional.controller';
import { TrustedProjectController } from './controllers/trusted-project.controller';
import { QualificationController } from './controllers/qualification.controller';
import { ReputationController } from './controllers/reputation.controller';
import { EndorsementController } from './controllers/endorsement.controller';
import { ProjectFitController } from './controllers/project-fit.controller';
import { TrustProfileController } from './controllers/trust-profile.controller';
import { IdentityGovernanceAdminController } from './controllers/identity-governance-admin.controller';
import { IdentityAuditLogService } from './services/audit-log.service';
import { AccountContextService } from './services/account-context.service';
import { ContextPermissionService } from './services/context-permission.service';
import { PublishingPermissionService } from './services/publishing-permission.service';
import { VerificationService } from './services/verification.service';
import { ProjectMembershipService } from './services/project-membership.service';
import { ProfessionalCertificationService } from './services/professional-certification.service';
import { AgencyCertificationService } from './services/agency-certification.service';
import { OrganizationWorkspaceService } from './services/organization-workspace.service';
import { OrganizationMemberService } from './services/organization-member.service';
import { TrustedProjectListingService } from './services/trusted-project-listing.service';
import { QualificationService } from './services/qualification.service';
import { ReputationEventService } from './services/reputation-event.service';
import { EndorsementService } from './services/endorsement.service';
import { ProjectEligibilityRuleService } from './services/project-eligibility-rule.service';
import { ProjectFitAssessmentService } from './services/project-fit-assessment.service';
import { ProjectFitApplicationService } from './services/project-fit-application.service';
import { ProjectFitAppealService } from './services/project-fit-appeal.service';
import { ProjectFitConfigService } from './services/project-fit-config.service';
import { ProjectEligibilityRuleTemplateService } from './services/project-eligibility-rule-template.service';
import { ReputationEventDisputeService } from './services/reputation-event-dispute.service';
import { TrustProfileService } from './services/trust-profile.service';
import { IdentityGovernanceScheduler } from './schedulers/identity-governance.scheduler';
import { IdentityGovernanceEventService } from './services/identity-governance-event.service';
import { ProjectFitAppealOverturnService } from './services/project-fit-appeal-overturn.service';
import { ProjectFitDocumentService } from './services/project-fit-document.service';
import { IdentityDocumentOcrService } from './services/identity-document-ocr.service';
import { IdentityDocumentStorageService } from './storage/identity-document-storage.service';

@Module({
  imports: [PrismaModule, EventEmitterModule, ConfigModule, AuthModule, Gate1Module],
  controllers: [
    AccountContextController,
    VerificationController,
    PublishingPermissionController,
    ProfessionalController,
    TrustedProjectController,
    QualificationController,
    ReputationController,
    EndorsementController,
    ProjectFitController,
    TrustProfileController,
    IdentityGovernanceAdminController,
  ],
  providers: [
    IdentityAuditLogService,
    VerificationService,
    ProfessionalCertificationService,
    AgencyCertificationService,
    PublishingPermissionService,
    AccountContextService,
    ContextPermissionService,
    ProjectMembershipService,
    OrganizationWorkspaceService,
    OrganizationMemberService,
    TrustedProjectListingService,
    QualificationService,
    ReputationEventService,
    EndorsementService,
    ProjectEligibilityRuleService,
    ProjectFitAssessmentService,
    ProjectFitApplicationService,
    ProjectFitAppealService,
    ProjectFitConfigService,
    ProjectEligibilityRuleTemplateService,
    ReputationEventDisputeService,
    TrustProfileService,
    IdentityGovernanceScheduler,
    IdentityGovernanceEventService,
    ProjectFitAppealOverturnService,
    ProjectFitDocumentService,
    IdentityDocumentOcrService,
    IdentityDocumentStorageService,
    AdminStrictAuthGuard,
  ],
  exports: [
    IdentityAuditLogService,
    PublishingPermissionService,
    VerificationService,
    AccountContextService,
    ContextPermissionService,
    ProjectMembershipService,
    ProfessionalCertificationService,
    AgencyCertificationService,
    OrganizationWorkspaceService,
    OrganizationMemberService,
    TrustedProjectListingService,
    QualificationService,
    ReputationEventService,
    EndorsementService,
    ProjectEligibilityRuleService,
    ProjectFitAssessmentService,
    ProjectFitApplicationService,
    ProjectFitAppealService,
    ProjectFitConfigService,
    ProjectEligibilityRuleTemplateService,
    ReputationEventDisputeService,
    TrustProfileService,
  ],
})
export class IdentityGovernanceModule {}
