import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { EndorsementService } from '../services/endorsement.service';
import { SubmitEndorsementDto } from '../dto/identity-governance.dto';
import { EndorsementSubjectType } from '../constants/endorsement.constants';

@ApiTags('identity-governance')
@Controller('identity/endorsements')
export class EndorsementController {
  constructor(private readonly endorsement: EndorsementService) {}

  @Post()
  @ApiOperation({ summary: '提交机构/个人事实背书（需审核后公开）' })
  async submit(@CurrentUser() user: CurrentUserPayload, @Body() body: SubmitEndorsementDto) {
    return successResponse(await this.endorsement.submit(user.userId, body));
  }

  @Get('subjects/:subjectType/:subjectId')
  @ApiOperation({ summary: '公开查询已激活背书（非综合信用分）' })
  async listForSubject(
    @Param('subjectType') subjectType: EndorsementSubjectType,
    @Param('subjectId') subjectId: string,
  ) {
    return successResponse(await this.endorsement.listForSubject(subjectType, subjectId));
  }

  @Get('issuers/:subjectType/:subjectId')
  @ApiOperation({ summary: '查询某主体签发的背书记录' })
  async listIssuedBy(
    @Param('subjectType') subjectType: EndorsementSubjectType,
    @Param('subjectId') subjectId: string,
  ) {
    return successResponse(await this.endorsement.listIssuedBy(subjectType, subjectId));
  }
}
