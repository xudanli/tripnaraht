import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
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
import {
  CreateLedgerExpenseDto,
  NotifyLedgerSettlementDto,
  UpdateLedgerExpenseDto,
} from './dto/team-ledger.dto';
import { TeamLedgerService } from './services/team-ledger.service';

@ApiTags('trip-team-ledger')
@ApiBearerAuth()
@Public()
@Controller('trips/:tripId/ledger')
export class TeamLedgerController {
  constructor(private readonly ledger: TeamLedgerService) {}

  @Get('overview')
  @ApiOperation({ summary: '团队账本总览（汇总 + 成员 + 最近记账）' })
  @ApiParam({ name: 'tripId' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getOverview(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.getOverview(tripId, this.resolveUserId(user));
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('expenses/:expenseId')
  @ApiOperation({ summary: '单笔记账详情' })
  async getExpense(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.getExpense(
        tripId,
        expenseId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('expenses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '记一笔' })
  async createExpense(
    @Param('tripId') tripId: string,
    @Body() body: CreateLedgerExpenseDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.createExpense(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Patch('expenses/:expenseId')
  @ApiOperation({ summary: '更新记账（部分字段）' })
  async updateExpense(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @Body() body: UpdateLedgerExpenseDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.updateExpense(
        tripId,
        expenseId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Delete('expenses/:expenseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除记账（软删；已结清返回 409）' })
  async deleteExpense(
    @Param('tripId') tripId: string,
    @Param('expenseId') expenseId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.deleteExpense(
        tripId,
        expenseId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('settlement')
  @ApiOperation({ summary: '最少转账结算图（基于 pending 流水）' })
  async getSettlement(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.getSettlement(tripId, this.resolveUserId(user));
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('settlement/notify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '向涉及成员推送结算结果' })
  async notifySettlement(
    @Param('tripId') tripId: string,
    @Body() body: NotifyLedgerSettlementDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.notifySettlement(
        tripId,
        this.resolveUserId(user),
        body,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Post('transfers/:transferId/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '确认一笔结算转账（写入 trip_ledger_transfer_confirms）',
  })
  @ApiParam({ name: 'tripId' })
  @ApiParam({ name: 'transferId', description: 'settlement.transfers[].id' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async confirmTransfer(
    @Param('tripId') tripId: string,
    @Param('transferId') transferId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.ledger.confirmTransfer(
        tripId,
        transferId,
        this.resolveUserId(user),
      );
      return successResponse(data);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  private resolveUserId(user?: CurrentUserPayload): string {
    if (user?.userId) return user.userId;
    if (process.env.NODE_ENV !== 'production') return 'anonymous-dev-user';
    throw new UnauthorizedException('未认证或 token 无效');
  }

  /** Propagate 4xx HttpExceptions; wrap unexpected as envelope. */
  private handleErrorOrThrow(e: unknown) {
    if (
      e instanceof UnauthorizedException ||
      e instanceof ForbiddenException ||
      e instanceof NotFoundException ||
      e instanceof BadRequestException ||
      e instanceof ConflictException ||
      e instanceof HttpException
    ) {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
