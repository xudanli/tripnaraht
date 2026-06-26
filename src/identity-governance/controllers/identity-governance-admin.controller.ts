import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { AdminStrictAuthGuard } from '../../admin/guards/admin-strict-auth.guard';
import { ProfessionalCertificationService } from '../services/professional-certification.service';
import { AgencyCertificationService } from '../services/agency-certification.service';
import { PublishingPermissionService } from '../services/publishing-permission.service';
import { VerificationService } from '../services/verification.service';
import { ProjectMembershipService } from '../services/project-membership.service';
import { ReviewProfessionalCertDto } from '../dto/professional-certification.dto';
import {
  ReviewAgencyCertDto,
  ReviewPublishingApplicationDto,
  ReviewVerificationDto,
  ReviewTrustedProjectListingDto,
  RecordReputationEventDto,
  ReviewQualificationDto,
  ReviewEndorsementDto,
} from '../dto/identity-governance.dto';
import { VerificationType } from '../constants/identity-governance.constants';
import { TrustedProjectListingService } from '../services/trusted-project-listing.service';
import { QualificationService } from '../services/qualification.service';
import { ReputationEventService } from '../services/reputation-event.service';
import { EndorsementService } from '../services/endorsement.service';
import { ProjectFitAppealService } from '../services/project-fit-appeal.service';
import { ProjectFitAssessmentService } from '../services/project-fit-assessment.service';
import { ReputationEventDisputeService } from '../services/reputation-event-dispute.service';
import { ResolveProjectFitAppealDto, AppealAdminNoteDto, ResolveReputationDisputeDto } from '../dto/project-fit.dto';
import { ReputationEventType } from '../constants/reputation-event.constants';

@ApiTags('Admin - Identity Governance')
@Controller('admin/identity')
@UseGuards(AdminStrictAuthGuard)
export class IdentityGovernanceAdminController {
  constructor(
    private readonly professionalCertification: ProfessionalCertificationService,
    private readonly agencyCertification: AgencyCertificationService,
    private readonly publishingPermission: PublishingPermissionService,
    private readonly verification: VerificationService,
    private readonly projectMembership: ProjectMembershipService,
    private readonly trustedProjects: TrustedProjectListingService,
    private readonly qualification: QualificationService,
    private readonly reputation: ReputationEventService,
    private readonly endorsement: EndorsementService,
    private readonly projectFitAppeals: ProjectFitAppealService,
    private readonly fitAssessment: ProjectFitAssessmentService,
    private readonly reputationDisputes: ReputationEventDisputeService,
  ) {}

  @Get('professional/applications')
  @ApiOperation({ summary: '列出待审核 Professional 认证申请' })
  async listProfessionalApplications(@Query('status') status?: string) {
    return successResponse(
      await this.professionalCertification.listForReview(status ?? 'UNDER_REVIEW'),
    );
  }

  @Post('professional/applications/:id/review')
  @ApiOperation({ summary: '审核 Professional 认证申请' })
  async reviewProfessionalApplication(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ReviewProfessionalCertDto,
  ) {
    return successResponse(
      await this.professionalCertification.review(admin.userId, id, body.action, body.notes),
    );
  }

  @Get('agency/applications')
  @ApiOperation({ summary: '列出待审核 Agency 企业认证申请' })
  async listAgencyApplications(@Query('status') status?: string) {
    return successResponse(await this.agencyCertification.listForReview(status ?? 'UNDER_REVIEW'));
  }

  @Post('agency/applications/:id/review')
  @ApiOperation({ summary: '审核 Agency 企业认证申请' })
  async reviewAgencyApplication(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ReviewAgencyCertDto,
  ) {
    return successResponse(
      await this.agencyCertification.review(admin.userId, id, body.action, body.notes),
    );
  }

  @Get('publishing/applications')
  @ApiOperation({ summary: '列出待审核发布权限申请' })
  async listPublishingApplications(@Query('status') status?: string) {
    return successResponse(await this.publishingPermission.listApplicationsForReview(status ?? 'PENDING'));
  }

  @Post('publishing/applications/:id/review')
  @ApiOperation({ summary: '审核发布权限申请' })
  async reviewPublishingApplication(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ReviewPublishingApplicationDto,
  ) {
    return successResponse(
      await this.publishingPermission.reviewApplication(admin.userId, id, body.action, body.notes),
    );
  }

  @Get('verification/pending')
  @ApiOperation({ summary: '列出待审核身份验证' })
  async listPendingVerifications(@Query('type') type?: VerificationType) {
    return successResponse(await this.verification.listPendingForReview(type));
  }

  @Post('verification/users/:userId/types/:type/review')
  @ApiOperation({ summary: '审核用户身份验证' })
  async reviewVerification(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('userId') userId: string,
    @Param('type') type: VerificationType,
    @Body() body: ReviewVerificationDto,
  ) {
    return successResponse(
      await this.verification.review(admin.userId, userId, type, body.action, body.notes),
    );
  }

  @Post('project-memberships/backfill')
  @ApiOperation({ summary: '从 TripCollaborator 回填 ProjectMembership（运维）' })
  async backfillProjectMemberships(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 500;
    return successResponse(
      await this.projectMembership.backfillFromTripCollaborators(
        Number.isFinite(parsedLimit) ? parsedLimit : 500,
      ),
    );
  }

  @Get('trusted-projects/applications')
  @ApiOperation({ summary: '列出待审核可信旅行项目' })
  async listTrustedProjectsForReview(@Query('status') status?: string) {
    return successResponse(await this.trustedProjects.listForReview(status ?? 'UNDER_REVIEW'));
  }

  @Post('trusted-projects/:id/review')
  @ApiOperation({ summary: '审核可信旅行项目' })
  async reviewTrustedProject(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ReviewTrustedProjectListingDto,
  ) {
    return successResponse(
      await this.trustedProjects.reviewListing(admin.userId, id, body.action, body.notes),
    );
  }

  @Get('qualifications/pending')
  @ApiOperation({ summary: '列出待审核资质' })
  async listPendingQualifications(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 50;
    return successResponse(
      await this.qualification.listPendingForReview(
        Number.isFinite(parsedLimit) ? parsedLimit : 50,
      ),
    );
  }

  @Post('qualifications/:id/review')
  @ApiOperation({ summary: '审核资质材料' })
  async reviewQualification(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ReviewQualificationDto,
  ) {
    return successResponse(
      await this.qualification.review(admin.userId, id, body.action, body.notes),
    );
  }

  @Post('reputation-events')
  @ApiOperation({ summary: '人工记录声誉事件（投诉、安全事件等）' })
  async recordReputationEvent(
    @CurrentUser() admin: CurrentUserPayload,
    @Body() body: RecordReputationEventDto,
  ) {
    return successResponse(
      await this.reputation.record({
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        eventType: body.eventType as ReputationEventType,
        evidenceSource: body.evidenceSource,
        projectId: body.projectId,
        listingId: body.listingId,
        eventResult: body.eventResult,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
        recordedById: admin.userId,
      }),
    );
  }

  @Post('qualifications/expire-outdated')
  @ApiOperation({ summary: '手动触发资质过期扫描（运维）' })
  async expireOutdatedQualifications() {
    return successResponse({ expiredCount: await this.qualification.expireOutdated() });
  }

  @Get('endorsements/pending')
  @ApiOperation({ summary: '列出待审核背书' })
  async listPendingEndorsements(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 50;
    return successResponse(
      await this.endorsement.listPendingForReview(
        Number.isFinite(parsedLimit) ? parsedLimit : 50,
      ),
    );
  }

  @Post('endorsements/:id/review')
  @ApiOperation({ summary: '审核机构/个人背书' })
  async reviewEndorsement(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ReviewEndorsementDto,
  ) {
    return successResponse(
      await this.endorsement.review(admin.userId, id, body.action, body.notes),
    );
  }

  @Post('endorsements/expire-outdated')
  @ApiOperation({ summary: '手动触发背书过期扫描（运维）' })
  async expireOutdatedEndorsements() {
    return successResponse({ expiredCount: await this.endorsement.expireOutdated() });
  }

  @Get('reputation/disputes/pending')
  @ApiOperation({ summary: '列出待处理声誉争议' })
  async listPendingReputationDisputes(@Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 50;
    return successResponse(
      await this.reputationDisputes.listPending(Number.isFinite(parsedLimit) ? parsedLimit : 50),
    );
  }

  @Post('reputation/disputes/:id/start-review')
  @ApiOperation({ summary: '开始声誉争议审核' })
  async startReputationDisputeReview(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
  ) {
    return successResponse(await this.reputationDisputes.startReview(admin.userId, id));
  }

  @Post('reputation/disputes/:id/resolve')
  @ApiOperation({ summary: '处理声誉争议' })
  async resolveReputationDispute(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ResolveReputationDisputeDto,
  ) {
    return successResponse(
      await this.reputationDisputes.resolve(admin.userId, id, body.status, body.resolution),
    );
  }

  @Post('project-fit/assessments/expire-outdated')
  @ApiOperation({ summary: '手动触发适合度评估过期扫描（运维）' })
  async expireOutdatedFitAssessments() {
    return successResponse({ expiredCount: await this.fitAssessment.expireOutdated() });
  }

  @Get('project-fit/appeals/pending')
  @ApiOperation({ summary: '列出待处理 Project Fit 申诉' })
  async listPendingProjectFitAppeals(
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : 50;
    const resolvedLimit = Number.isFinite(parsedLimit) ? parsedLimit : 50;
    if (status) {
      const statuses = status.split(',').map((s) => s.trim()) as never;
      return successResponse(await this.projectFitAppeals.listByStatus(statuses, resolvedLimit));
    }
    return successResponse(await this.projectFitAppeals.listPending(resolvedLimit));
  }

  @Post('project-fit/appeals/:id/triage')
  @ApiOperation({ summary: '申诉分诊（SUBMITTED → TRIAGED）' })
  async triageProjectFitAppeal(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: AppealAdminNoteDto,
  ) {
    return successResponse(await this.projectFitAppeals.triage(admin.userId, id, body.notes));
  }

  @Post('project-fit/appeals/:id/start-review')
  @ApiOperation({ summary: '开始申诉审核（→ UNDER_REVIEW）' })
  async startProjectFitAppealReview(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: AppealAdminNoteDto,
  ) {
    return successResponse(
      await this.projectFitAppeals.startReview(admin.userId, id, body.notes),
    );
  }

  @Post('project-fit/appeals/:id/resolve')
  @ApiOperation({ summary: '处理 Project Fit 申诉' })
  async resolveProjectFitAppeal(
    @CurrentUser() admin: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ResolveProjectFitAppealDto,
  ) {
    return successResponse(
      await this.projectFitAppeals.resolve(admin.userId, id, body.resolution, body.status),
    );
  }
}
