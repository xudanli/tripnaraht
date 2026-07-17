/**
 * Stable Causal Decision product BFF.
 * FE should use these routes — not Trace / Gateway internals.
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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { CausalDecisionProductService } from '../services/causal-decision-product.service';
import {
  ApplyCausalDecisionBodyDto,
  SelectCausalDecisionBodyDto,
} from '../dto/causal-decision-body.dto';

@ApiTags('causal-decision')
@Public()
@Controller('trips/:tripId/causal-decisions')
export class CausalDecisionController {
  constructor(
    private readonly product: CausalDecisionProductService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List open Travel Causal Decisions (product BFF)' })
  async list(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      return successResponse(await this.product.list(tripId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':decisionId')
  @ApiOperation({ summary: 'Get Causal Decision product view' })
  async get(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      return successResponse(await this.product.get(tripId, decisionId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Get(':decisionId/outcome')
  @ApiOperation({
    summary: 'Get outcome reconciliation status (never invent CONFIRMED)',
  })
  async getOutcome(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      await this.assertMember(tripId, user);
      return successResponse(await this.product.getOutcome(tripId, decisionId));
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':decisionId/select')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Select an intervention option (Gateway when executable, else Trace bind)',
  })
  async select(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: SelectCausalDecisionBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      return successResponse(
        await this.product.select(tripId, decisionId, userId, body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post(':decisionId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply selected option via Gateway; outcome stays PENDING until observation',
  })
  async apply(
    @Param('tripId') tripId: string,
    @Param('decisionId') decisionId: string,
    @Body() body: ApplyCausalDecisionBodyDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.assertMember(tripId, user);
      return successResponse(
        await this.product.apply(tripId, decisionId, userId, body),
      );
    } catch (e) {
      return this.handleError(e);
    }
  }

  private async assertMember(tripId: string, user?: CurrentUserPayload): Promise<void> {
    const userId = this.access.resolveUserId(user);
    await this.access.assertTripMember(tripId, userId);
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
      const message =
        typeof resp === 'string'
          ? resp
          : typeof resp === 'object' && resp !== null && 'message' in resp
            ? String((resp as { message?: string | string[] }).message)
            : e.message;
      return errorResponse(ErrorCode.VALIDATION_ERROR, message);
    }
    throw e;
  }
}
