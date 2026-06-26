import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import type { WishCategory } from '../wishlist/types/trip-wish.types';
import { WISH_CATEGORIES } from '../wishlist/types/trip-wish.types';
import {
  CreatePreferenceRoundDto,
  SubmitHeardVotesDto,
  SubmitUtteranceDto,
} from './dto/preference-round.dto';
import { PreferenceRoundService } from './services/preference-round.service';

@ApiTags('trip-process-fairness')
@Public()
@Controller('trips/:tripId/preference-rounds')
export class PreferenceRoundController {
  constructor(private readonly roundService: PreferenceRoundService) {}

  @Get()
  @ApiOperation({ summary: '偏好分享轮次列表（F3.1）' })
  @ApiParam({ name: 'tripId' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const items = await this.roundService.listRounds(tripId, this.resolveUserId(user));
      return successResponse({ items, count: items.length });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('active')
  @ApiOperation({ summary: '按领域查询进行中的轮次 ID' })
  @ApiQuery({ name: 'domain', enum: WISH_CATEGORIES })
  async getActive(
    @Param('tripId') tripId: string,
    @Query('domain') domain: WishCategory,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      this.resolveUserId(user);
      if (!WISH_CATEGORIES.includes(domain)) {
        throw new BadRequestException(`无效领域: ${domain}`);
      }
      const roundId = await this.roundService.getActiveRoundForDomain(tripId, domain);
      return successResponse({ domain, activeRoundId: roundId });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '发起结构化偏好分享轮次（Round Robin）' })
  async create(
    @Param('tripId') tripId: string,
    @Body() body: CreatePreferenceRoundDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const round = await this.roundService.createRound(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(round);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':roundId')
  @ApiOperation({ summary: '轮次详情（发言流 + 当前轮到谁 + 被听见率）' })
  async getOne(
    @Param('tripId') tripId: string,
    @Param('roundId') roundId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const round = await this.roundService.getRound(
        tripId,
        roundId,
        this.resolveUserId(user),
      );
      return successResponse(round);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':roundId/utterances')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交偏好发言（仅当前轮到你时可提交）' })
  async submitUtterance(
    @Param('tripId') tripId: string,
    @Param('roundId') roundId: string,
    @Body() body: SubmitUtteranceDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const round = await this.roundService.submitUtterance(
        tripId,
        roundId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(round);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':roundId/heard-votes')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交「你被听见了吗？」匿名反馈' })
  async submitHeardVotes(
    @Param('tripId') tripId: string,
    @Param('roundId') roundId: string,
    @Body() body: SubmitHeardVotesDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const round = await this.roundService.submitHeardVotes(
        tripId,
        roundId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(round);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':roundId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手动结束轮次' })
  async close(
    @Param('tripId') tripId: string,
    @Param('roundId') roundId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const round = await this.roundService.closeRound(
        tripId,
        roundId,
        this.resolveUserId(user),
      );
      return successResponse(round);
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
    const message = e instanceof Error ? e.message : String(e);
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.BAD_REQUEST, message);
    }
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
