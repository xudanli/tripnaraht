/**
 * L1 + Legacy V1.5 write/read paths that do not conflict with RFC-002 Unified Gateway.
 * When DECISION_GATEWAY_UNIFIED=1, problem list/detail/options routes live on UnifiedDecisionController.
 */

import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { DecisionSemanticsService } from '../services/decision-semantics.service';
import type { CreateDecisionRequestBody } from '../types/decision-semantics.types';

@ApiTags('decision-semantics')
@Public()
@Controller('trips/:tripId')
export class DecisionSemanticsL1Controller {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly semantics: DecisionSemanticsService,
  ) {}

  @Get('decision-center/overview')
  @ApiOperation({ summary: 'Decision Center L1 总览（enforcement 聚合 + 影响范围 + 近期决策）' })
  async getOverview(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.semantics.getOverview(tripId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('decisions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '记录决策（PROPOSED/APPROVED + TripMutationSet 快照）' })
  async createDecision(
    @Param('tripId') tripId: string,
    @Body() body: CreateDecisionRequestBody,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.semantics.createDecision(tripId, userId, body);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decisions/:decisionId/execution-status')
  @ApiOperation({ summary: '决策执行状态读模型（轮询 apply / 重算 / validation）' })
  async getDecisionExecutionStatus(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.semantics.getDecisionExecutionStatus(tripId, decisionId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decisions/:decisionId/validation')
  @ApiOperation({ summary: '决策结果验证（prediction vs actual）' })
  async getDecisionValidation(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.semantics.getDecisionValidation(tripId, decisionId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decisions/:decisionId')
  @ApiOperation({ summary: '读取已记录的决策' })
  async getDecision(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.semantics.getDecision(tripId, decisionId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get('decision-ledger/nodes/:ledgerNodeId/decision')
  @ApiOperation({ summary: '由 Ledger nodeId 反查触发它的用户决策（caused_by）' })
  @ApiParam({ name: 'ledgerNodeId', description: 'Decision Ledger nodeId' })
  async resolveDecisionForLedgerNode(
    @Param('tripId') tripId: string,
    @Param('ledgerNodeId') ledgerNodeId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = await this.semantics.resolveDecisionForLedgerNode(tripId, ledgerNodeId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
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
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    const message = e instanceof Error ? e.message : 'Unknown error';
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
