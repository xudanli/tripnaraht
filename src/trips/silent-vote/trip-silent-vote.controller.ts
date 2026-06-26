import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../common/dto/api-response.dto';
import { TripSilentVoteService } from './services/trip-silent-vote.service';
import {
  CreateSilentVoteDto,
  CreateSilentVoteFromCompareDto,
  SubmitSilentVoteBallotDto,
} from './dto/silent-vote.dto';

@ApiTags('trip-silent-votes')
@Public()
@Controller('trips/:tripId/silent-votes')
export class TripSilentVoteController {
  constructor(private readonly voteService: TripSilentVoteService) {}

  @Get()
  @ApiOperation({ summary: '行程内 Silent Vote 列表（含聚合热力图）' })
  @ApiParam({ name: 'tripId' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const items = await this.voteService.listVotes(tripId, this.resolveUserId(user));
      return successResponse({ items, count: items.length });
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('from-compare')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '从方案对比结果发起 2+ 选项匿名投票' })
  async createFromCompare(
    @Param('tripId') tripId: string,
    @Body() body: CreateSilentVoteFromCompareDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.voteService.createFromCompare(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建 Silent Vote（可 autoOpen）' })
  async create(
    @Param('tripId') tripId: string,
    @Body() body: CreateSilentVoteDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const item = await this.voteService.createVote(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(item);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':voteId/ballot/mine')
  @ApiOperation({ summary: '我的选票（仅自己可见）' })
  async getMyBallot(
    @Param('tripId') tripId: string,
    @Param('voteId') voteId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.voteService.getMyBallot(tripId, voteId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put(':voteId/ballot')
  @ApiOperation({ summary: '提交或更新匿名选票（选项 + 强度 1-5）' })
  async submitBallot(
    @Param('tripId') tripId: string,
    @Param('voteId') voteId: string,
    @Body() body: SubmitSilentVoteBallotDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const ballot = await this.voteService.submitBallot(
        tripId,
        voteId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(ballot);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':voteId/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '开放投票' })
  async open(
    @Param('tripId') tripId: string,
    @Param('voteId') voteId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.voteService.openVote(tripId, voteId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':voteId/close')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '关闭投票并锁定聚合结果' })
  async close(
    @Param('tripId') tripId: string,
    @Param('voteId') voteId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.voteService.closeVote(tripId, voteId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':voteId')
  @ApiOperation({ summary: '投票详情 + 聚合热力图 + 讨论提示' })
  async getOne(
    @Param('tripId') tripId: string,
    @Param('voteId') voteId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      return successResponse(
        await this.voteService.getVote(tripId, voteId, this.resolveUserId(user)),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  private handleError(e: unknown) {
    if (e instanceof UnauthorizedException || e instanceof BadRequestException) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
