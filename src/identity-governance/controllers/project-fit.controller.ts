import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { ProjectEligibilityRuleService } from '../services/project-eligibility-rule.service';
import { ProjectFitAssessmentService } from '../services/project-fit-assessment.service';
import { ProjectFitApplicationService } from '../services/project-fit-application.service';
import { ProjectFitAppealService } from '../services/project-fit-appeal.service';
import { Public } from '../../auth/decorators/public.decorator';
import { ProjectFitConfigService } from '../services/project-fit-config.service';
import {
  LeaderApplicationDecisionDto,
  SaveFitAnswersDto,
  SubmitFitApplicationDto,
  SubmitProjectFitAppealDto,
  UpdateListingFitConfigDto,
  UpsertEligibilityRuleDto,
  ClarificationResponseDto,
  ApplicationCenterQueryDto,
  CreateRuleTemplateDto,
  ApplyRuleTemplateDto,
  UploadFitDocumentBase64Dto,
} from '../dto/project-fit.dto';
import { ProjectEligibilityRuleTemplateService } from '../services/project-eligibility-rule-template.service';
import { ProjectFitDocumentService } from '../services/project-fit-document.service';
import { FIT_DOCUMENT_TYPES } from '../constants/project-fit-document.constants';

@ApiTags('project-fit')
@Controller()
export class ProjectFitController {
  constructor(
    private readonly eligibilityRules: ProjectEligibilityRuleService,
    private readonly fitAssessment: ProjectFitAssessmentService,
    private readonly fitApplication: ProjectFitApplicationService,
    private readonly appeals: ProjectFitAppealService,
    private readonly fitConfig: ProjectFitConfigService,
    private readonly ruleTemplates: ProjectEligibilityRuleTemplateService,
    private readonly fitDocuments: ProjectFitDocumentService,
  ) {}

  @Public()
  @Get('trusted-projects/:listingId/fit-questionnaire')
  @ApiOperation({ summary: '动态适合度问卷（preview=预评估，full=正式申请）' })
  async getQuestionnaire(
    @Param('listingId') listingId: string,
    @Query('phase') phase?: 'preview' | 'full',
  ) {
    return successResponse(await this.fitAssessment.getQuestionnaire(listingId, phase ?? 'preview'));
  }

  @Get('trusted-projects/:listingId/fit-config')
  @ApiOperation({ summary: '查看项目适合度配置' })
  async getFitConfig(@Param('listingId') listingId: string) {
    return successResponse(await this.fitConfig.getConfig(listingId));
  }

  @Post('trusted-projects/:listingId/fit-config')
  @ApiOperation({ summary: '更新项目适合度配置（发布者）' })
  async updateFitConfig(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() body: UpdateListingFitConfigDto,
  ) {
    return successResponse(await this.fitConfig.updateConfig(user.userId, listingId, body));
  }

  @Public()
  @Get('trusted-projects/:listingId/eligibility-rules')
  @ApiOperation({ summary: '查看项目准入规则（公开）' })
  async listRules(@Param('listingId') listingId: string) {
    return successResponse(await this.eligibilityRules.listActiveRules(listingId));
  }

  @Post('trusted-projects/:listingId/eligibility-rules')
  @ApiOperation({ summary: '创建/更新项目准入规则（发布者）' })
  async upsertRule(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() body: UpsertEligibilityRuleDto,
  ) {
    return successResponse(await this.eligibilityRules.upsertRule(user.userId, listingId, body));
  }

  @Get('trusted-projects/:listingId/fit-assessment-status')
  @ApiOperation({ summary: '当前用户适合度评估状态（含是否需重新评估）' })
  async getAssessmentStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
  ) {
    return successResponse(
      await this.fitAssessment.getAssessmentStatusForUser(user.userId, listingId),
    );
  }

  @Post('trusted-projects/:listingId/eligibility-rules/seed-defaults')
  @ApiOperation({ summary: '初始化默认准入规则（发布者）' })
  async seedDefaults(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
  ) {
    return successResponse(await this.eligibilityRules.seedDefaultRules(user.userId, listingId));
  }

  @Post('trusted-projects/:listingId/fit-assessments')
  @ApiOperation({ summary: '开始 Project Fit 评估' })
  async startAssessment(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
  ) {
    return successResponse(await this.fitAssessment.startAssessment(user.userId, listingId));
  }

  @Patch('project-fit/assessments/:id/answers')
  @ApiOperation({ summary: '保存适合度问卷答案' })
  async saveAnswers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: SaveFitAnswersDto,
  ) {
    return successResponse(await this.fitAssessment.saveAnswers(user.userId, id, body.answers));
  }

  @Post('project-fit/assessments/:id/evaluate')
  @ApiOperation({ summary: '执行适合度评估（规则引擎）' })
  async evaluate(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.fitAssessment.evaluate(user.userId, id));
  }

  @Get('project-fit/assessments/:id/report')
  @ApiOperation({ summary: '获取角色脱敏适合度报告' })
  async getReport(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Query('role') role?: 'applicant' | 'leader' | 'operator',
  ) {
    const resolvedRole = role ?? 'applicant';
    return successResponse(await this.fitAssessment.getReport(user.userId, id, resolvedRole));
  }

  @Post('trusted-projects/:listingId/applications/with-fit')
  @ApiOperation({ summary: '提交带适合度评估的项目申请' })
  async submitApplication(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() body: SubmitFitApplicationDto,
  ) {
    return successResponse(
      await this.fitApplication.submitWithAssessment(user.userId, listingId, body),
    );
  }

  @Get('trusted-projects/:listingId/applications/review-queue')
  @ApiOperation({ summary: '领队审核队列（脱敏适合度摘要 + 系统建议）' })
  async listReviewQueue(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
  ) {
    return successResponse(await this.fitApplication.listReviewQueue(user.userId, listingId));
  }

  @Post('project-fit/applications/:id/clarify')
  @ApiOperation({ summary: '申请人回复领队补充问题' })
  async respondToClarification(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: ClarificationResponseDto,
  ) {
    return successResponse(
      await this.fitApplication.respondToClarification(user.userId, id, body.message),
    );
  }

  @Post('project-fit/applications/:id/decision')
  @ApiOperation({ summary: '领队审核决定' })
  async leaderDecision(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: LeaderApplicationDecisionDto,
  ) {
    return successResponse(await this.fitApplication.leaderDecision(user.userId, id, body));
  }

  @Post('project-fit/applications/:id/confirm')
  @ApiOperation({ summary: '用户双向确认' })
  async userConfirm(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.fitApplication.userConfirm(user.userId, id));
  }

  @Get('project-fit/applications/:id')
  @ApiOperation({ summary: '申请详情（申请人/领队）' })
  async getApplication(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.fitApplication.getApplicationDetail(user.userId, id));
  }

  @Post('project-fit/appeals')
  @ApiOperation({ summary: '提交申诉' })
  async submitAppeal(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SubmitProjectFitAppealDto,
  ) {
    return successResponse(await this.appeals.submit(user.userId, body));
  }

  @Get('project-fit/appeals/mine')
  @ApiOperation({ summary: '我的申诉列表' })
  async listAppeals(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.appeals.listMine(user.userId));
  }

  @Get('project-fit/applications/mine')
  @ApiOperation({ summary: '申请中心 — 我的项目申请' })
  async listMyApplications(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ApplicationCenterQueryDto,
  ) {
    return successResponse(
      await this.fitApplication.listMyApplications(user.userId, {
        status: query.status,
        limit: query.limit,
        cursor: query.cursor,
      }),
    );
  }

  @Get('project-fit/applications/managed')
  @ApiOperation({ summary: '申请中心 — 领队/发布者管理的申请' })
  async listManagedApplications(
    @CurrentUser() user: CurrentUserPayload,
    @Query() query: ApplicationCenterQueryDto,
  ) {
    return successResponse(
      await this.fitApplication.listLeaderApplicationCenter(user.userId, {
        listingId: query.listingId,
        status: query.status,
        limit: query.limit,
      }),
    );
  }

  @Post('project-fit/applications/:id/deposit-paid')
  @ApiOperation({ summary: '商业项目 — 确认定金已支付（R2 占位，后续接支付网关）' })
  async recordDepositPaid(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.fitApplication.recordDepositPaid(user.userId, id));
  }

  @Get('project-fit/rule-templates')
  @ApiOperation({ summary: '可用准入规则模板（平台 + 机构）' })
  async listRuleTemplates(
    @CurrentUser() user: CurrentUserPayload,
    @Query('organizationId') organizationId?: string,
  ) {
    return successResponse(await this.ruleTemplates.listAvailable(user.userId, organizationId));
  }

  @Post('project-fit/rule-templates')
  @ApiOperation({ summary: '创建机构/平台规则模板' })
  async createRuleTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateRuleTemplateDto,
  ) {
    return successResponse(await this.ruleTemplates.create(user.userId, body));
  }

  @Post('trusted-projects/:listingId/apply-rule-template')
  @ApiOperation({ summary: '将规则模板应用到项目' })
  async applyRuleTemplate(
    @CurrentUser() user: CurrentUserPayload,
    @Param('listingId') listingId: string,
    @Body() body: ApplyRuleTemplateDto,
  ) {
    return successResponse(
      await this.ruleTemplates.applyToListing(user.userId, listingId, body.templateId),
    );
  }

  @Get('project-fit/assessments/:id/documents')
  @ApiOperation({ summary: '列出评估关联的证件/文档（脱敏）' })
  async listDocuments(@CurrentUser() user: CurrentUserPayload, @Param('id') id: string) {
    return successResponse(await this.fitDocuments.listForAssessment(user.userId, id));
  }

  @Post('project-fit/assessments/:id/documents')
  @ApiOperation({ summary: '上传证件并自动 OCR（multipart）' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        documentType: { type: 'string', enum: [...FIT_DOCUMENT_TYPES] },
        linkedQuestionKey: { type: 'string' },
        locale: { type: 'string' },
      },
      required: ['file', 'documentType'],
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { documentType: string; linkedQuestionKey?: string; locale?: string },
  ) {
    return successResponse(
      await this.fitDocuments.upload(user.userId, id, file, {
        documentType: body.documentType as never,
        linkedQuestionKey: body.linkedQuestionKey,
        locale: body.locale,
      }),
    );
  }

  @Post('project-fit/assessments/:id/documents/base64')
  @ApiOperation({ summary: '上传证件（Base64，移动端）并自动 OCR' })
  async uploadDocumentBase64(
    @CurrentUser() user: CurrentUserPayload,
    @Param('id') id: string,
    @Body() body: UploadFitDocumentBase64Dto,
  ) {
    return successResponse(
      await this.fitDocuments.uploadFromBase64(user.userId, id, {
        documentType: body.documentType as never,
        fileName: body.fileName,
        mimeType: body.mimeType,
        contentBase64: body.contentBase64,
        linkedQuestionKey: body.linkedQuestionKey,
        locale: body.locale,
      }),
    );
  }

  @Post('project-fit/documents/:documentId/re-run-ocr')
  @ApiOperation({ summary: '重新执行证件 OCR' })
  async rerunDocumentOcr(
    @CurrentUser() user: CurrentUserPayload,
    @Param('documentId') documentId: string,
    @Query('locale') locale?: string,
  ) {
    return successResponse(await this.fitDocuments.runOcr(user.userId, documentId, locale));
  }
}
