import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { QualificationService } from '../services/qualification.service';
import { SubmitQualificationDto } from '../dto/identity-governance.dto';
import { QualificationSubjectType } from '../constants/qualification.constants';

@ApiTags('identity-governance')
@Controller('identity/qualifications')
export class QualificationController {
  constructor(private readonly qualification: QualificationService) {}

  @Get('mine')
  @ApiOperation({ summary: '查询我的资质记录（含所属机构）' })
  async listMine(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.qualification.listMine(user.userId));
  }

  @Post()
  @ApiOperation({ summary: '提交资质材料' })
  async submit(@CurrentUser() user: CurrentUserPayload, @Body() body: SubmitQualificationDto) {
    return successResponse(await this.qualification.submit(user.userId, body));
  }

  @Get('subjects/:subjectType/:subjectId')
  @ApiOperation({ summary: '公开查询已验证资质（无综合分）' })
  async listVerified(
    @Param('subjectType') subjectType: QualificationSubjectType,
    @Param('subjectId') subjectId: string,
  ) {
    return successResponse(await this.qualification.listVerifiedForSubject(subjectType, subjectId));
  }
}
