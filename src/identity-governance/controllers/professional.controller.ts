import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { ProfessionalCertificationService } from '../services/professional-certification.service';
import { AgencyCertificationService } from '../services/agency-certification.service';
import { OrganizationWorkspaceService } from '../services/organization-workspace.service';
import { ProjectMembershipService } from '../services/project-membership.service';
import {
  CreateOrganizationDraftDto,
  SaveProfessionalDraftDto,
} from '../dto/professional-certification.dto';
import {
  InviteOrganizationMemberDto,
  SaveAgencyDraftDto,
} from '../dto/identity-governance.dto';
import { OrganizationMemberService } from '../services/organization-member.service';

@ApiTags('identity-governance')
@Controller('identity')
export class ProfessionalController {
  constructor(
    private readonly professionalCertification: ProfessionalCertificationService,
    private readonly agencyCertification: AgencyCertificationService,
    private readonly organizationWorkspace: OrganizationWorkspaceService,
    private readonly organizationMember: OrganizationMemberService,
    private readonly projectMembership: ProjectMembershipService,
  ) {}

  @Get('professional/status')
  @ApiOperation({ summary: '查询 Professional 认证进度' })
  async getProfessionalStatus(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.professionalCertification.getStatus(user.userId));
  }

  @Post('professional/draft')
  @ApiOperation({ summary: '保存 Professional 认证材料草稿' })
  async saveProfessionalDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: SaveProfessionalDraftDto,
  ) {
    return successResponse(await this.professionalCertification.saveDraft(user.userId, body));
  }

  @Post('professional/submit')
  @ApiOperation({ summary: '提交 Professional 认证申请' })
  async submitProfessional(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.professionalCertification.submit(user.userId));
  }

  @Get('project-memberships')
  @ApiOperation({ summary: '查询当前用户的项目角色（ProjectMembership）' })
  async listProjectMemberships(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.projectMembership.listForUser(user.userId));
  }

  @Post('organizations')
  @ApiOperation({ summary: '创建 Agency 草稿工作空间' })
  async createOrganization(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: CreateOrganizationDraftDto,
  ) {
    return successResponse(await this.organizationWorkspace.createDraft(user.userId, body.displayName));
  }

  @Get('organizations/mine')
  @ApiOperation({ summary: '列出当前用户所属机构' })
  async listOrganizations(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.organizationWorkspace.listForUser(user.userId));
  }

  @Get('organizations/invites/pending')
  @ApiOperation({ summary: '列出待接受的机构邀请' })
  async listPendingInvites(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.organizationMember.listPendingInvites(user.userId));
  }

  @Get('organizations/:organizationId/certification/status')
  @ApiOperation({ summary: '查询 Agency 企业认证进度' })
  async getAgencyStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
  ) {
    return successResponse(await this.agencyCertification.getStatus(organizationId, user.userId));
  }

  @Post('organizations/:organizationId/certification/draft')
  @ApiOperation({ summary: '保存 Agency 企业认证材料草稿' })
  async saveAgencyDraft(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
    @Body() body: SaveAgencyDraftDto,
  ) {
    return successResponse(
      await this.agencyCertification.saveDraft(organizationId, user.userId, body),
    );
  }

  @Post('organizations/:organizationId/certification/submit')
  @ApiOperation({ summary: '提交 Agency 企业认证申请' })
  async submitAgency(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
  ) {
    return successResponse(await this.agencyCertification.submit(organizationId, user.userId));
  }

  @Get('organizations/:organizationId/members')
  @ApiOperation({ summary: '列出机构成员' })
  async listOrgMembers(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
  ) {
    return successResponse(await this.organizationMember.listMembers(organizationId, user.userId));
  }

  @Post('organizations/:organizationId/members/invite')
  @ApiOperation({ summary: '邀请成员加入机构' })
  async inviteMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
    @Body() body: InviteOrganizationMemberDto,
  ) {
    return successResponse(
      await this.organizationMember.inviteMember(
        organizationId,
        user.userId,
        body.email,
        body.roles ?? ['ADVISOR'],
      ),
    );
  }

  @Post('organizations/:organizationId/members/accept')
  @ApiOperation({ summary: '接受机构邀请' })
  async acceptInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
  ) {
    return successResponse(await this.organizationMember.acceptInvite(organizationId, user.userId));
  }

  @Post('organizations/:organizationId/members/decline')
  @ApiOperation({ summary: '拒绝机构邀请' })
  async declineInvite(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
  ) {
    return successResponse(await this.organizationMember.declineInvite(organizationId, user.userId));
  }

  @Post('organizations/:organizationId/members/:userId/remove')
  @ApiOperation({ summary: '移除机构成员' })
  async removeMember(
    @CurrentUser() user: CurrentUserPayload,
    @Param('organizationId') organizationId: string,
    @Param('userId') targetUserId: string,
  ) {
    return successResponse(
      await this.organizationMember.removeMember(organizationId, user.userId, targetUserId),
    );
  }
}
