import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
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
import { mapWriteChainBlockedToErrorResponse } from '../../../decision-runtime/execution/effective-plan-write-chain-blocked.util';
import { ConstraintSolverAccessService } from '../services/constraint-solver-access.service';
import { ExecutionAdvisoryService } from '../services/execution-advisory.service';
import { ExecutionAdvisoryApplyService } from '../services/execution-advisory-apply.service';
import type { ApplyExecutionRecommendationRequestDto } from '../types/trip-constraint-solver.types';

@ApiTags('trip-constraint-solver')
@Public()
@Controller('trips/:tripId/in-trip/execution-advisory')
export class ExecutionAdvisoryController {
  constructor(
    private readonly access: ConstraintSolverAccessService,
    private readonly advisory: ExecutionAdvisoryService,
    private readonly advisoryApply: ExecutionAdvisoryApplyService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取行中执行守护建议（Runtime Assurance 读模型）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  async getAdvisory(
    @Param('tripId') tripId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const data = await this.advisory.getAdvisory(tripId, userId);
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post('recommendations/:recommendationId/apply')
  @ApiOperation({ summary: '应用行中推荐方案（Plan B 写回）' })
  @ApiParam({ name: 'tripId', description: '行程 ID' })
  @ApiParam({ name: 'recommendationId', description: '推荐方案 ID（来自 GET advisory recommendations）' })
  async applyRecommendation(
    @Param('tripId') tripId: string,
    @Param('recommendationId') recommendationId: string,
    @Body() body: ApplyExecutionRecommendationRequestDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      const data = await this.advisoryApply.applyRecommendation(
        tripId,
        recommendationId,
        userId,
        body,
      );
      return successResponse(data);
    } catch (e) {
      const writeChain = mapWriteChainBlockedToErrorResponse(e);
      if (writeChain) {
        return errorResponse('WRITE_CHAIN_BLOCKED', writeChain.error?.message ?? '应走决策写链', writeChain.error);
      }
      return this.handleError(e);
    }
  }

  private handleError(e: unknown) {
    if (e instanceof NotFoundException) {
      const resp = e.getResponse();
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : ErrorCode.NOT_FOUND;
      const msg =
        typeof resp === 'object' && resp && 'message' in resp
          ? String((resp as { message: string }).message)
          : e.message;
      return errorResponse(code, msg);
    }
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof ForbiddenException) {
      return errorResponse(ErrorCode.FORBIDDEN, e.message);
    }
    if (e instanceof ServiceUnavailableException) {
      const resp = e.getResponse();
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : 'EXECUTION_ADVISORY_DISABLED';
      const msg =
        typeof resp === 'object' && resp && 'message' in resp
          ? String((resp as { message: string }).message)
          : e.message;
      return errorResponse(code, msg);
    }
    if (e instanceof BadRequestException) {
      const resp = e.getResponse();
      const code =
        typeof resp === 'object' && resp && 'code' in resp
          ? String((resp as { code: string }).code)
          : ErrorCode.BAD_REQUEST;
      const msg =
        typeof resp === 'object' && resp && 'message' in resp
          ? String((resp as { message: string }).message)
          : e.message;
      return errorResponse(code, msg);
    }
    const err = e as Error;
    return errorResponse(ErrorCode.INTERNAL_ERROR, err?.message ?? '内部错误');
  }
}
