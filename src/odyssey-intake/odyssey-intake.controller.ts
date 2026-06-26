import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { successResponse } from '../common/dto/standard-response.dto';
import { OdysseyIntakeService } from './odyssey-intake.service';

@ApiTags('odyssey-intake')
@Public()
@Controller('odyssey-intake')
export class OdysseyIntakeController {
  constructor(private readonly odysseyIntakeService: OdysseyIntakeService) {}

  @Get('onboarding/status')
  @ApiOperation({ summary: '获取 Odyssey 入网状态' })
  async getOnboardingStatus(@CurrentUser() user?: CurrentUserPayload) {
    return successResponse(await this.odysseyIntakeService.getOnboardingStatus(user?.userId));
  }

  @Get('profile/card')
  @ApiOperation({ summary: '获取 Odyssey 旅行人格卡片' })
  async getProfileCard(@CurrentUser() user?: CurrentUserPayload) {
    return successResponse(await this.odysseyIntakeService.getProfileCard(user?.userId));
  }

  @Post('premium-stress-test/submit')
  @ApiOperation({ summary: '提交 Premium v2 抗压测评' })
  async submitPremiumStressTest(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() body: unknown,
  ) {
    return successResponse(await this.odysseyIntakeService.submit(user?.userId, body));
  }

  @Post('submit')
  @ApiOperation({ summary: '提交 Odyssey 测评' })
  async submit(@CurrentUser() user: CurrentUserPayload | undefined, @Body() body: unknown) {
    return successResponse(await this.odysseyIntakeService.submit(user?.userId, body));
  }

  @Get('premium-stress-test/questions')
  @ApiOperation({ summary: '获取 Premium v2 抗压测评题目' })
  getPremiumStressTestQuestions() {
    return successResponse(this.odysseyIntakeService.getPremiumStressTestQuestions());
  }

  @Get('questions')
  @ApiOperation({ summary: '获取 Odyssey 测评题目' })
  getQuestions() {
    return successResponse(this.odysseyIntakeService.getQuestions());
  }

  @Patch('trip-intent')
  @ApiOperation({ summary: '更新 Odyssey 出行意向标签' })
  async updateTripIntent(
    @CurrentUser() user: CurrentUserPayload | undefined,
    @Body() body: unknown,
  ) {
    return successResponse(await this.odysseyIntakeService.updateTripIntent(user?.userId, body));
  }
}
