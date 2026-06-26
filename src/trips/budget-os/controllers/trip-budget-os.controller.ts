import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Put,
  Query,
  Post,
  Patch,
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { BudgetStructureService } from '../services/budget-structure.service';
import { TripBudgetIntentService } from '../services/trip-budget-intent.service';
import { TripBudgetProfileService } from '../services/trip-budget-profile.service';
import { TravelWalletService } from '../services/travel-wallet.service';
import { TripValueFeedbackService } from '../services/trip-value-feedback.service';
import { MoneyDnaService } from '../services/money-dna.service';
import { TripBudgetAccessService } from '../services/trip-budget-access.service';
import { BudgetStructurePresetService } from '../services/budget-structure-preset.service';
import { RosterRequiredException } from '../services/trip-wallet-roster.service';
import type { SubmitValueFeedbackInput } from '../types/value-feedback.types';
import type {
  CreateManualLedgerInput,
  PatchLedgerEntryInput,
  PutWalletRuleInput,
} from '../types/travel-wallet.types';
import type {
  PutBudgetIntentInput,
  PutBudgetStructureInput,
} from '../types/trip-budget-os.types';
import { buildStructurePresets } from '../utils/structure-presets.util';

import {
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ApiSuccessResponseDto } from '../../../common/dto/api-response.dto';

@ApiTags('trip-budget-os')
@Public()
@Controller('trips/:tripId/budget')
export class TripBudgetOsController {
  constructor(
    private readonly intentService: TripBudgetIntentService,
    private readonly structureService: BudgetStructureService,
    private readonly profileService: TripBudgetProfileService,
    private readonly walletService: TravelWalletService,
    private readonly valueFeedbackService: TripValueFeedbackService,
    private readonly moneyDnaService: MoneyDnaService,
    private readonly accessService: TripBudgetAccessService,
    private readonly presetService: BudgetStructurePresetService,
  ) {}

  @Get('intent')
  @ApiOperation({ summary: '获取 L1 总预算意图' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  async getIntent(@Param('tripId') tripId: string) {
    try {
      const intent = await this.intentService.getIntent(tripId);
      return successResponse(intent);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put('intent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '设置或更新 L1 总预算意图' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiResponse({ status: 200, type: ApiSuccessResponseDto })
  @ApiResponse({ status: 409, description: 'STRUCTURE_OVERFLOW — L2 结构总和超过新总预算' })
  async putIntent(
    @Param('tripId') tripId: string,
    @Body() body: PutBudgetIntentInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertBudgetWriteAccess(tripId, user);
      const intent = await this.intentService.setIntent(tripId, body);
      return successResponse(intent);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Delete('intent')
  @ApiOperation({ summary: '清除 L1 总预算意图' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async deleteIntent(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertBudgetWriteAccess(tripId, user);
      await this.intentService.deleteIntent(tripId);
      return successResponse({ tripId, deletedAt: new Date().toISOString() });
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('structure/presets')
  @ApiOperation({ summary: '获取 L2 预算结构预设（Money DNA 推荐）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getStructurePresets(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId =
        user?.userId ?? (await this.accessService.resolvePrimaryUserId(tripId));
      if (!userId) {
        return successResponse(buildStructurePresets(null));
      }
      const presets = await this.presetService.getPresetsForUser(userId);
      return successResponse(presets);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('structure')
  @ApiOperation({ summary: '获取 L2 预算结构' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getStructure(@Param('tripId') tripId: string) {
    try {
      const structure = await this.structureService.getStructure(tripId);
      return successResponse(structure);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put('structure')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '设置 L2 预算结构' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async putStructure(
    @Param('tripId') tripId: string,
    @Body() body: PutBudgetStructureInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertBudgetWriteAccess(tripId, user);
      const structure = await this.structureService.setStructure(tripId, body);
      return successResponse(structure);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('profile')
  @ApiOperation({ summary: '聚合预算档案（L1+L2+可选 actuals）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiQuery({
    name: 'include',
    required: false,
    description: '逗号分隔：actuals,wallet,value',
  })
  async getProfile(
    @Param('tripId') tripId: string,
    @Query('include') include?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const includes = include
        ? include.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const userId =
        user?.userId ?? (await this.accessService.resolvePrimaryUserId(tripId)) ?? undefined;
      const profile = await this.profileService.getProfile(tripId, includes, { userId });
      return successResponse(profile);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('wallet')
  @ApiOperation({ summary: '获取 L3 旅行钱包' })
  async getWallet(@Param('tripId') tripId: string) {
    try {
      return successResponse(await this.walletService.getWallet(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Put('wallet/rule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '设置付款规则' })
  async putWalletRule(
    @Param('tripId') tripId: string,
    @Body() body: PutWalletRuleInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertBudgetWriteAccess(tripId, user);
      const rule = await this.walletService.putPaymentRule(tripId, body);
      return successResponse(rule);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('wallet/ledger')
  @ApiOperation({ summary: '账本列表' })
  @ApiQuery({ name: 'settled', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listLedger(
    @Param('tripId') tripId: string,
    @Query('settled') settled?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    try {
      const data = await this.walletService.listLedger(tripId, {
        settled: settled === undefined ? undefined : settled === 'true',
        limit: limit ? parseInt(limit, 10) : 50,
        offset: offset ? parseInt(offset, 10) : 0,
      });
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('wallet/ledger')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '手动记账' })
  async createLedger(
    @Param('tripId') tripId: string,
    @Body() body: CreateManualLedgerInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertBudgetWriteAccess(tripId, user);
      const entry = await this.walletService.createManualLedger(tripId, body);
      return successResponse(entry);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Patch('wallet/ledger/:entryId')
  @ApiOperation({ summary: '更新账本条目（结算/分摊人）' })
  async patchLedger(
    @Param('tripId') tripId: string,
    @Param('entryId') entryId: string,
    @Body() body: PatchLedgerEntryInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertBudgetWriteAccess(tripId, user);
      const entry = await this.walletService.patchLedgerEntry(tripId, entryId, body);
      return successResponse(entry);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('wallet/balances')
  @ApiOperation({ summary: '欠账摘要' })
  async getBalances(@Param('tripId') tripId: string) {
    try {
      return successResponse(await this.walletService.getBalances(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('value-feedback')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '提交单笔价值满意度反馈（L4）' })
  async submitValueFeedback(
    @Param('tripId') tripId: string,
    @Body() body: SubmitValueFeedbackInput,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.resolveUserId(user);
      await this.accessService.assertTripMember(tripId, userId);
      const feedback = await this.valueFeedbackService.submitFeedback(tripId, userId, body);
      if (user?.userId) {
        await this.moneyDnaService.recomputeForUser(user.userId);
      }
      return successResponse(feedback);
    } catch (e) {
      return this.handleErrorOrThrow(e);
    }
  }

  @Get('value-summary')
  @ApiOperation({ summary: '行程价值汇总（L4）' })
  async getValueSummary(@Param('tripId') tripId: string) {
    try {
      return successResponse(await this.valueFeedbackService.getValueSummary(tripId));
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

  private async assertBudgetWriteAccess(
    tripId: string,
    user?: CurrentUserPayload,
  ): Promise<void> {
    const userId = this.resolveUserId(user);
    if (userId === 'anonymous-dev-user') {
      return;
    }
    await this.accessService.assertCanModifyBudget(tripId, userId);
  }

  /** Propagate HTTP exceptions (409/403/401) instead of wrapping as 200 */
  private handleErrorOrThrow(e: unknown) {
    if (e instanceof HttpException) {
      throw e;
    }
    return this.handleError(e);
  }

  private handleError(e: unknown) {
    if (e instanceof RosterRequiredException) {
      const body = e.getResponse() as { code?: string; message?: string };
      return {
        success: false,
        error: {
          code: body.code ?? 'ROSTER_REQUIRED',
          message: body.message ?? '组队行程需要 roster',
        },
      };
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    if (e instanceof ConflictException) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
    }
    return errorResponse(
      ErrorCode.INTERNAL_ERROR,
      e instanceof Error ? e.message : 'Unknown error',
    );
  }
}
