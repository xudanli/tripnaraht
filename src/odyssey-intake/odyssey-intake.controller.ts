import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Patch,
  Post,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../auth/decorators/current-user.decorator';
import { successResponse, errorResponse, ErrorCode } from '../common/dto/standard-response.dto';
import { ApiErrorResponseDto, ApiSuccessResponseDto } from '../common/dto/api-response.dto';
import { OdysseyIntakeService } from './odyssey-intake.service';
import {
  MatchCompanionsDto,
  PeerFeedbackDto,
  SelectMbtiDto,
  SubmitAndMatchDto,
  SubmitOdysseyIntakeDto,
  SubmitPremiumIntakeDto,
  SubmitPremiumStressTestDto,
  TrustVerifyDto,
  VerifyEducationCredentialDto,
  VerifyProfessionCredentialDto,
  SendProfessionEmailCodeDto,
  VerifyProfessionEmailDto,
  VerifyProfessionOAuthDto,
  VerifyProfessionBadgeDto,
  UploadProfessionBadgeDto,
  UpdateTripIntentDto,
  UpdateTripMetaDto,
} from './dto/odyssey-intake.dto';

@ApiTags('odyssey-intake')
@Controller('odyssey-intake')
export class OdysseyIntakeController {
  constructor(private readonly odysseyIntakeService: OdysseyIntakeService) {}

  @Public()
  @Get('mbti/types')
  @ApiOperation({
    summary: 'v2 — 16 型 MBTI 卡片选择器',
    description: 'Apple Wallet 质感卡片；文案「已知自己的旅行人格？直接一键点亮。」',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  getMbtiTypeCards() {
    return successResponse(this.odysseyIntakeService.getMbtiTypeCards());
  }

  @Public()
  @Post('mbti/select')
  @ApiOperation({
    summary: 'v2 — 自选 MBTI（环节 1）',
    description: '秒级点亮旅行人格；完成后进入硬核背书 → Premium Stress Test。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async selectMbti(@Body() dto: SelectMbtiDto, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.selectMbti(user.userId, dto);
      return successResponse(profile);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('premium-stress-test/questions')
  @ApiOperation({
    summary: 'v2 — Premium Stress Test 题库（环节 3）',
    description: '3 道高端行中博弈题：资源挤兑、分工协同、溢价消费决策。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  getPremiumStressQuestions() {
    return successResponse(this.odysseyIntakeService.getPremiumStressQuestions());
  }

  @Public()
  @Post('premium-stress-test/submit')
  @ApiOperation({
    summary: 'v2 — 提交 Premium Stress Test 并生成名片',
    description: '需先 POST /mbti/select；结合自选 MBTI 与博弈题生成雷达图与行中协作基因。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async submitPremiumStressTest(
    @Body() dto: SubmitPremiumStressTestDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.submitPremiumStressTest(user.userId, dto);
      return successResponse(profile);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('questions')
  @ApiOperation({
    summary: '【兼容】获取 Premium Stress Test 题库',
    description: '旧 /questions 路径保留；v1 五题已下线，返回 3 道行中博弈题 + deprecated 提示。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  getQuestions() {
    return successResponse(this.odysseyIntakeService.getQuestions());
  }

  @Public()
  @Get('onboarding/status')
  @ApiOperation({
    summary: '入网流程状态',
    description: 'v2：mbti_select → credentials → premium_stress_test → trust_verify → match',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getOnboardingStatus(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const status = await this.odysseyIntakeService.getOnboardingStatus(user.userId);
      return successResponse(status);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('profile/card')
  @ApiOperation({
    summary: 'My Profile 旅行人格卡片（UI 契约）',
    description:
      '个人主页头部 1/3 区域数据源；含流光刷新状态、CTA、陀螺仪开关与意向标签池。严禁放入 Settings 二级页。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getProfileCard(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const view = await this.odysseyIntakeService.getProfileCardView(user.userId);
      return successResponse(view);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('profile')
  @ApiOperation({
    summary: '获取当前用户旅行人格画像（原始数据）',
    description: '未完成测评时 data 为 null。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getProfile(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.getProfile(user.userId);
      return successResponse(profile);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('submit')
  @ApiOperation({
    summary: 'v2 — 一次性提交 MBTI + Premium Stress Test',
    description: '等价于 mbti/select + premium-stress-test/submit；v1 五题已下线。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async submitIntake(
    @Body() dto: SubmitPremiumIntakeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.submitPremiumIntake(user.userId, dto);
      return successResponse(profile);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('submit/legacy')
  @ApiOperation({
    summary: '【已废弃】v1 五题测评',
    description: '返回 VALIDATION_ERROR，请改用 Premium Intake 流程。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async submitLegacyIntake(
    @Body() dto: SubmitOdysseyIntakeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.submitIntake(user.userId, dto.answers);
      return successResponse(profile);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('submit-and-match')
  @ApiOperation({
    summary: '提交 Premium Intake 并返回契合旅伴',
    description:
      'MBTI 自选 + 3 道博弈题 → 生成名片 →（若已 trust verify）返回推荐列表。前端 loading ≤1.5s。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async submitAndMatch(
    @Body() dto: SubmitAndMatchDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.odysseyIntakeService.submitAndMatch(user.userId, {
        mbtiType: dto.mbtiType,
        answers: dto.answers,
        tripMeta: dto.tripMeta,
        matchLimit: dto.matchLimit,
      });
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('trust/verify')
  @ApiOperation({
    summary: '实名 / 芝麻信用安全授权',
    description: 'PRD 入网流程第二步；生产环境 authToken 由第三方网关校验。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async verifyTrust(@Body() dto: TrustVerifyDto, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const trust = await this.odysseyIntakeService.verifyTrust(user.userId, dto);
      return successResponse(trust);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/education/verify')
  @ApiOperation({
    summary: 'PRD 3.1.3 — 学信网在线验证码授信',
    description: '仅提交 verificationCode；degree/tier 由合规网关回写，严禁用户自选或存校名。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async verifyEducationCredential(
    @Body() dto: VerifyEducationCredentialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const bundle = await this.odysseyIntakeService.verifyEducationCredential(user.userId, dto);
      return successResponse({ credentials: bundle });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/profession/email/send-code')
  @ApiOperation({ summary: 'PRD 3.1.3 — 通道 A：发送企业邮箱验证码' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async sendProfessionEmailCode(
    @Body() dto: SendProfessionEmailCodeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.odysseyIntakeService.sendProfessionEmailVerificationCode(
        user.userId,
        dto,
      );
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/profession/email/verify')
  @ApiOperation({ summary: 'PRD 3.1.3 — 通道 A：校验企业邮箱验证码' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async verifyProfessionEmail(
    @Body() dto: VerifyProfessionEmailDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const bundle = await this.odysseyIntakeService.verifyProfessionEmailCredential(
        user.userId,
        dto,
      );
      return successResponse({ credentials: bundle });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/profession/oauth/verify')
  @ApiOperation({ summary: 'PRD 3.1.3 — 通道 C：脉脉 / LinkedIn OAuth 授信' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async verifyProfessionOAuth(
    @Body() dto: VerifyProfessionOAuthDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const bundle = await this.odysseyIntakeService.verifyProfessionOAuthCredential(
        user.userId,
        dto,
      );
      return successResponse({ credentials: bundle });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/profession/badge/upload')
  @ApiOperation({
    summary: 'PRD 3.1.3 — 通道 B：上传工牌/名片（返回 imageToken）',
    description: '图片暂存 Redis，verify 后立即销毁；生产可改走外部 OCR 网关。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async uploadProfessionBadge(
    @Body() dto: UploadProfessionBadgeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.odysseyIntakeService.uploadProfessionBadgeImage(user.userId, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/profession/badge/verify')
  @ApiOperation({
    summary: 'PRD 3.1.3 — 通道 B：工牌/名片 OCR 授信',
    description: 'OCR 审核通过后销毁原图，仅保留模糊行业/职级标签。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async verifyProfessionBadge(
    @Body() dto: VerifyProfessionBadgeDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const bundle = await this.odysseyIntakeService.verifyProfessionBadgeCredential(
        user.userId,
        dto,
      );
      return successResponse({ credentials: bundle });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('credentials/profession/verify')
  @ApiOperation({
    summary: '【已废弃】自选职业背书',
    description: 'PRD 3.1.3 起返回 VALIDATION_ERROR，请改用 email/oauth/badge 通道。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async verifyProfessionCredential(
    @Body() dto: VerifyProfessionCredentialDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const bundle = await this.odysseyIntakeService.verifyProfessionCredential(user.userId, dto);
      return successResponse({ credentials: bundle });
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('credentials/gateway/status')
  @ApiOperation({
    summary: '授信网关通道状态（运维/联调）',
    description: '返回各通道 stub/production 与 urlHost；不暴露 API Key。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  getCredentialGatewayStatus() {
    return successResponse(this.odysseyIntakeService.getCredentialGatewayStatus());
  }

  @Public()
  @Get('credentials/me')
  @ApiOperation({ summary: 'PRD 3.1.2/3.1.3 — 我的背书资产（Identity Hub）' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getMyCredentials(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const view = await this.odysseyIntakeService.getVerifiedCredentialsView(user.userId);
      return successResponse(view);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('trip-meta')
  @ApiOperation({
    summary: '设置当前出行行程元数据',
    description: '目的地与时间窗口；用于 Hard Gate 旅伴匹配过滤。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async updateTripMeta(@Body() dto: UpdateTripMetaDto, @CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const meta = await this.odysseyIntakeService.updateTripMeta(user.userId, dto);
      return successResponse(meta);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Get('trip-meta')
  @ApiOperation({ summary: '获取当前出行行程元数据' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getTripMeta(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const meta = await this.odysseyIntakeService.getTripMeta(user.userId);
      return successResponse(meta);
    } catch (error: unknown) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Patch('trip-intent')
  @ApiOperation({
    summary: '调整本次出行即时意向标签',
    description:
      '推荐请求体 `{ "tripIntentTag": "budget_mode" }`；兼容 trip_intent_tag / tripIntentTags / trip_intent_tags。' +
      '响应为完整 OdysseyProfileCardView（与 GET profile/card 同结构），且已持久化 tripIntentTags。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async updateTripIntent(
    @Body() dto: UpdateTripIntentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const cardView = await this.odysseyIntakeService.updateTripIntent(user.userId, dto);
      return successResponse(cardView);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('match')
  @ApiOperation({
    summary: '精准推荐契合旅伴列表',
    description: '需先完成 trust verify；Hard Gate 过滤 + Soft Weight 排序，目标 300ms 内完成。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async matchCompanions(
    @Body() dto: MatchCompanionsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const result = await this.odysseyIntakeService.matchCompanions(user.userId, dto);
      return successResponse(result);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof BadRequestException) {
        return errorResponse(ErrorCode.VALIDATION_ERROR, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('peer-feedback')
  @ApiOperation({
    summary: '行后互评（数据回哺）',
    description: '行程结束后对搭子评价，动态修正消费带宽 / 计划硬度等分值。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async peerFeedback(
    @Body() dto: PeerFeedbackDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.applyPeerFeedback(user.userId, dto);
      return successResponse(profile);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }

  @Public()
  @Post('profile/ack-refresh')
  @ApiOperation({
    summary: '确认卡片流光刷新已读',
    description: '用户查看更新后的雷达图后调用，清除 profileRefreshPending 状态。',
  })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async ackProfileRefresh(@CurrentUser() user: CurrentUserPayload) {
    try {
      if (!user?.userId) {
        return errorResponse(ErrorCode.UNAUTHORIZED, '未认证或 token 无效');
      }
      const profile = await this.odysseyIntakeService.acknowledgeProfileRefresh(user.userId);
      return successResponse(profile);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return errorResponse(ErrorCode.NOT_FOUND, error.message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, (error as Error).message);
    }
  }
}
