import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  Body,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import {
  ErrorCode,
  errorResponse,
  successResponse,
} from '../../common/dto/standard-response.dto';
import { DecisionProblemNegotiationOrchestratorService } from './services/decision-problem-negotiation-orchestrator.service';
import { StartDecisionProblemNegotiationDto } from './dto/decision-problem-negotiation.dto';

@ApiTags('trip-process-fairness')
@Public()
@Controller('trips/:tripId/decision-problems/:problemId/negotiations')
export class DecisionProblemNegotiationController {
  constructor(
    private readonly orchestrator: DecisionProblemNegotiationOrchestratorService,
  ) {}

  @Get('preflight')
  @ApiOperation({ summary: '决策问题发起协商前校验（禁用按钮 / Tooltip）' })
  @ApiParam({ name: 'tripId' })
  @ApiParam({ name: 'problemId' })
  @ApiQuery({ name: 'focusConflictId', required: false })
  async preflight(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Query('focusConflictId') focusConflictId?: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.orchestrator.preflight(
        tripId,
        this.resolveUserId(user),
        problemId,
        focusConflictId,
      );
      return successResponse(data);
    } catch (e) {
      return this.handleError(e);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '从决策问题一键发起结构化协商（domain 映射 + 任务绑定 + 轮次创建/复用 + 深链）',
  })
  async start(
    @Param('tripId') tripId: string,
    @Param('problemId') problemId: string,
    @Body() body: StartDecisionProblemNegotiationDto = {},
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const data = await this.orchestrator.startNegotiation(
        tripId,
        this.resolveUserId(user),
        problemId,
        body,
      );
      return successResponse(data);
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
    if (e instanceof UnauthorizedException) {
      return errorResponse(ErrorCode.UNAUTHORIZED, e.message);
    }
    if (e instanceof NotFoundException) {
      return errorResponse(ErrorCode.NOT_FOUND, e.message);
    }
    if (e instanceof BadRequestException) {
      return errorResponse(ErrorCode.VALIDATION_ERROR, e.message);
    }
    if (e instanceof ConflictException) {
      const response = e.getResponse();
      if (typeof response === 'object' && response !== null) {
        const payload = response as Record<string, unknown>;
        return errorResponse(
          ErrorCode.BUSINESS_ERROR,
          String(payload.messageCN ?? payload.message ?? e.message),
          payload,
        );
      }
      return errorResponse(ErrorCode.BUSINESS_ERROR, e.message);
    }
    const message = e instanceof Error ? e.message : String(e);
    return errorResponse(ErrorCode.INTERNAL_ERROR, message);
  }
}
