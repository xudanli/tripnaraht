import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { successResponse, errorResponse } from '../../common/dto/standard-response.dto';
import { ConstraintSolverAccessService } from '../trip-constraint-solver/services/constraint-solver-access.service';
import { PageInsightOrchestratorService } from './services/page-insight-orchestrator.service';
import { PageContractNotFoundError } from './services/page-ai-contract.registry';
import { EvaluatePageInsightDto, PageInsightFeedbackDto } from './dto/page-insight.dto';
import type { ClientPageState } from './contracts/page-insight.types';

@ApiTags('nara-copilot')
@Public()
@Controller('trips/:tripId/copilot')
export class PageInsightController {
  constructor(
    private readonly orchestrator: PageInsightOrchestratorService,
    private readonly access: ConstraintSolverAccessService,
  ) {}

  @Post('page-insights:evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Evaluate Nara Page Insight for current page (no plan writes)',
  })
  async evaluate(
    @Param('tripId') tripId: string,
    @Body() body: EvaluatePageInsightDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const client = body as ClientPageState;
      const data = await this.orchestrator.evaluate(tripId, client);
      return successResponse(data);
    } catch (error) {
      return this.mapError(error);
    }
  }

  @Get('page-insights/:insightId')
  @ApiOperation({ summary: 'Get a previously generated Page Insight' })
  async getInsight(
    @Param('tripId') tripId: string,
    @Param('insightId') insightId: string,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = this.orchestrator.getInsight(tripId, insightId);
      return successResponse(data);
    } catch (error) {
      return this.mapError(error);
    }
  }

  @Post('page-insights/:insightId/feedback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record Page Insight user feedback (P0 collect-only)' })
  async feedback(
    @Param('tripId') tripId: string,
    @Param('insightId') insightId: string,
    @Body() body: PageInsightFeedbackDto,
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    try {
      const userId = this.access.resolveUserId(user);
      await this.access.assertTripMember(tripId, userId);
      const data = this.orchestrator.submitFeedback(tripId, insightId, body);
      return successResponse(data);
    } catch (error) {
      return this.mapError(error);
    }
  }

  private mapError(error: unknown) {
    if (error instanceof PageContractNotFoundError) {
      return errorResponse('PAGE_CONTRACT_NOT_FOUND', error.message);
    }
    if (error instanceof NotFoundException) {
      return errorResponse('NOT_FOUND', error.message);
    }
    if (error instanceof BadRequestException) {
      return errorResponse('BAD_REQUEST', error.message);
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse('INTERNAL_ERROR', message);
  }
}
