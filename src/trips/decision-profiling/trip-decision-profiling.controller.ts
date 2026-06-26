import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { DecisionProfilingService } from './services/decision-profiling.service';
import { DecisionProfilingProfileService } from './services/decision-profiling-profile.service';
import { TravelStyleQuizService } from './services/travel-style-quiz.service';
import { MoneyDnaQuizService } from './services/money-dna-quiz.service';
import { FrictionRadarService } from './services/friction-radar.service';
import { SplitConsensusService } from './services/split-consensus.service';
import {
  ConfirmSplitDto,
  PatchTravelStyleNoteDto,
  ReuseProfileDto,
  SelectSplitModeDto,
  SimulateSplitDto,
  SubmitQuizDto,
} from './dto/decision-profiling.dto';

@ApiTags('trip-decision-profiling')
@Public()
@Controller('trips/:tripId/decision-profiling')
export class TripDecisionProfilingController {
  constructor(
    private readonly profiling: DecisionProfilingService,
    private readonly profile: DecisionProfilingProfileService,
    private readonly travelStyle: TravelStyleQuizService,
    private readonly moneyDna: MoneyDnaQuizService,
    private readonly frictionRadar: FrictionRadarService,
    private readonly splitConsensus: SplitConsensusService,
  ) {}

  @Get('onboarding')
  @ApiOperation({ summary: 'PDI-4 入职调查状态（成员加入后触发）' })
  async getOnboarding(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.profiling.getOnboardingStatus(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('quiz')
  @ApiOperation({ summary: '获取 Travel Style + Money DNA 调查题库' })
  async getQuiz() {
    return successResponse(this.profiling.getQuizBundle());
  }

  @Post('my/reuse-profile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '一键沿用上次正式完成的 Travel Style + Money DNA 画像' })
  async reuseProfile(
    @Param('tripId') tripId: string,
    @Body() body: ReuseProfileDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      const sections = body.sections ?? ['travel_style', 'money_dna'];
      if (
        sections.length !== 2
        || !sections.includes('travel_style')
        || !sections.includes('money_dna')
      ) {
        throw new BadRequestException({
          code: 'BAD_REQUEST',
          message: 'sections 必须恰好包含 travel_style 与 money_dna',
        });
      }

      const result = await this.profile.reuseProfile(tripId, userId, body.userNote);
      void this.frictionRadar.getRadar(tripId, userId).catch(() => undefined);
      return successResponse(result);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('my/travel-style')
  @ApiOperation({ summary: '获取本人旅行风格卡片（完整版）' })
  async getMyTravelStyle(@CurrentUser() user?: CurrentUserPayload) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.travelStyle.getMyCard(userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('my/travel-style')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交 Travel Style 调查并生成风格卡片' })
  async submitTravelStyle(
    @Param('tripId') tripId: string,
    @Body() body: SubmitQuizDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.travelStyle.submitQuiz(this.resolveUserId(user), tripId, body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Patch('my/travel-style')
  @ApiOperation({ summary: '微调旅行风格卡片备注' })
  async patchTravelStyle(
    @Body() body: PatchTravelStyleNoteDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.travelStyle.patchCard(this.resolveUserId(user), body.userNote),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('team/travel-style')
  @ApiOperation({ summary: '团队旅行风格卡片（脱敏：仅标签与兼容提示）' })
  async getTeamTravelStyle(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.travelStyle.getTeamCards(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('my/money-dna')
  @ApiOperation({ summary: '获取本人 Money DNA 卡片（完整雷达图数据）' })
  async getMyMoneyDna(@CurrentUser() user?: CurrentUserPayload) {
    try {
      return successResponse(await this.moneyDna.getMyCard(this.resolveUserId(user)));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('my/money-dna')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '提交 Money DNA 调查' })
  async submitMoneyDna(
    @Param('tripId') tripId: string,
    @Body() body: SubmitQuizDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.moneyDna.submitQuiz(this.resolveUserId(user), tripId, body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('team/money-dna')
  @ApiOperation({ summary: '团队 Money DNA（脱敏：仅消费风格相似度）' })
  async getTeamMoneyDna(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.moneyDna.getTeamSimilarity(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('friction-radar')
  @ApiOperation({ summary: 'F4.3 团队摩擦预警仪表盘' })
  async getFrictionRadar(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.frictionRadar.getRadar(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('split-consensus')
  @ApiOperation({ summary: 'F4.4 分摊机制共识状态与推荐' })
  async getSplitConsensus(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.splitConsensus.getState(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('split-consensus/select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '选择分摊机制' })
  async selectSplitMode(
    @Param('tripId') tripId: string,
    @Body() body: SelectSplitModeDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.splitConsensus.selectMode(tripId, this.resolveUserId(user), body.mode),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('split-consensus/simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '分摊方案可视化模拟' })
  async simulateSplit(
    @Param('tripId') tripId: string,
    @Body() body: SimulateSplitDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.splitConsensus.simulate(
          tripId,
          this.resolveUserId(user),
          body.totalEstimate,
          body.currency,
        ),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('split-consensus/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '确认分摊方案（全员确认后锁定并写入 Travel Wallet）' })
  async confirmSplit(
    @Param('tripId') tripId: string,
    @Body() _body: ConfirmSplitDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.splitConsensus.confirm(tripId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) {
      return user.userId;
    }
    if (process.env.NODE_ENV !== 'production') {
      return 'anonymous-dev-user';
    }
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      if (typeof resp === 'object' && resp !== null && 'code' in resp) {
        const { code, message } = resp as { code: string; message: string };
        return errorResponse(code, message);
      }
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    return errorResponse(
      ErrorCode.INTERNAL_ERROR,
      e instanceof Error ? e.message : 'Unknown error',
    );
  }
}
