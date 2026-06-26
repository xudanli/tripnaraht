import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../../auth/decorators/public.decorator';
import { GuardianChooseRequestDto, GuardianChooseResponseDto } from '../../dto/guardian-choose.dto';
import { GuardianChooseService } from '../../services/guardian-choose.service';

@ApiTags('User - Guardian')
@ApiBearerAuth()
@Controller('v2/trips')
export class GuardianTripController {
  private readonly logger = new Logger(GuardianTripController.name);

  constructor(private readonly guardianChoose: GuardianChooseService) {}

  @Public()
  @Post(':tripId/guardian/choose')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '提交 Guardian CHOOSE 用户选择',
    description:
      'P1 专用写回：校验 CHOOSE 会话、记录偏好、返回下一步编排动作。硬约束 BLOCK 时返回 409 + nextAction=BLOCKED。',
  })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, type: GuardianChooseResponseDto })
  @ApiResponse({ status: 409, description: '硬约束 BLOCK，不可 CHOOSE' })
  async submitGuardianChoose(
    @Param('tripId') tripId: string,
    @Body() dto: GuardianChooseRequestDto,
  ): Promise<GuardianChooseResponseDto> {
    this.logger.log(`[Guardian] CHOOSE trip=${tripId} source=${dto.source} index=${dto.selectedIndex}`);
    return this.guardianChoose.submitChoice(tripId, dto);
  }
}
