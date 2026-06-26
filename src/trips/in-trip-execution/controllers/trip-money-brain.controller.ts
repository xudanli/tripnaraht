import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { BudgetRebalanceService } from '../services/budget-rebalance.service';
import { InTripAccessService } from '../services/in-trip-access.service';
import { SmartTransactionService } from '../services/smart-transaction.service';
import type {
  RecordTransactionInput,
  RespondRebalanceInput,
} from '../types/money-brain.types';

@ApiTags('trip-in-trip-money')
@Public()
@Controller('trips/:tripId/in-trip/money')
export class TripMoneyBrainController {
  constructor(
    private readonly transactions: SmartTransactionService,
    private readonly rebalance: BudgetRebalanceService,
    private readonly access: InTripAccessService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: '心理账户 6 桶进度 + 今日消费流' })
  async getDashboard(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.transactions.getDashboard(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('transactions')
  @ApiOperation({ summary: '智能记账（manual / photo / voice）' })
  async recordTransaction(
    @Param('tripId') tripId: string,
    @Body() body: RecordTransactionInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.transactions.record(tripId, userId, body));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('transactions')
  @ApiOperation({ summary: '消费流分页' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listTransactions(
    @Param('tripId') tripId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(
        await this.transactions.listTransactions(tripId, userId, {
          limit: limit ? parseInt(limit, 10) : undefined,
          offset: offset ? parseInt(offset, 10) : undefined,
        }),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('nudges/today')
  @ApiOperation({ summary: '今日助推历史' })
  async getTodayNudges(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.transactions.getTodayNudges(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('rebalance')
  @ApiOperation({ summary: '待处理再平衡建议' })
  async listRebalance(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      return successResponse(await this.rebalance.listPending(tripId, userId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('rebalance/:suggestionId/respond')
  @ApiOperation({ summary: '接受或保留当前预算结构（组织者）' })
  @ApiParam({ name: 'suggestionId', description: '再平衡建议 ID' })
  async respondRebalance(
    @Param('tripId') tripId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() body: RespondRebalanceInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      if (!body?.response || !['accept', 'keep'].includes(body.response)) {
        throw new BadRequestException('response 须为 accept 或 keep');
      }
      return successResponse(
        await this.rebalance.respond(tripId, suggestionId, userId, body.response),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('需要登录');
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
      return errorResponse(ErrorCode.BAD_REQUEST, e.message);
    }
    if (e instanceof ServiceUnavailableException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
    }
    throw e;
  }
}
