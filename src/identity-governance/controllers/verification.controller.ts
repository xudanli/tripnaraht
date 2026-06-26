import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse } from '../../common/dto/standard-response.dto';
import { VerificationService } from '../services/verification.service';
import { StartVerificationDto } from '../dto/identity-governance.dto';
import { VerificationType } from '../constants/identity-governance.constants';

@ApiTags('identity-governance')
@Controller('identity/verification')
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get('status')
  @ApiOperation({ summary: '查询身份验证状态（Verification）' })
  async getStatus(@CurrentUser() user: CurrentUserPayload) {
    return successResponse(await this.verification.getSummary(user.userId));
  }

  @Post('start')
  @ApiOperation({ summary: '发起身份验证（手机/实名/年龄）' })
  async startVerification(
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: StartVerificationDto,
  ) {
    return successResponse(
      await this.verification.start(user.userId, body.type, {
        phone: body.phone,
        realName: body.realName,
        idNumberLast4: body.idNumberLast4,
        birthYear: body.birthYear,
      }),
    );
  }

  @Get('types')
  @ApiOperation({ summary: '支持的验证类型' })
  async listTypes() {
    const types: VerificationType[] = ['PHONE', 'REAL_NAME', 'AGE'];
    return successResponse({ types });
  }
}
