/**
 * Shadow Review Queue API — blind manual review of authority vs lex shadow winners.
 */

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Public } from '../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../common/dto/standard-response.dto';
import { isShadowObservabilityEnabled } from './shadow-observability-admin.controller';
import {
  ShadowReviewService,
  type MaterializeShadowReviewsInput,
  type SubmitShadowReviewInput,
} from './shadow-review.service';
import type { ShadowReviewCaseStatus } from './shadow-review.types';

class MaterializeShadowReviewsDto implements MaterializeShadowReviewsInput {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  comparisonIds?: string[];

  @IsOptional()
  @IsString()
  tripId?: string;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

class ReviewScorecardDto {
  @IsNumber()
  @Min(1)
  @Max(5)
  reasonableness!: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  executability!: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  requirementFit!: number;

  @IsNumber()
  @Min(1)
  @Max(5)
  paceFit!: number;
}

class SubmitShadowReviewDto {
  @IsIn(['A', 'B', 'EQUIVALENT', 'BOTH_INVALID', 'INSUFFICIENT_INFORMATION'])
  preferredOption!: SubmitShadowReviewInput['preferredOption'];

  @ValidateNested()
  @Type(() => ReviewScorecardDto)
  scores!: ReviewScorecardDto;

  @IsString()
  tradeOffSummary!: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  confidence!: number;

  @IsOptional()
  @IsString()
  reviewerId?: string;
}

@ApiTags('decision-engine')
@Controller('decision-engine/v1/shadow-reviews')
export class ShadowReviewController {
  constructor(@Optional() private readonly shadowReview?: ShadowReviewService) {}

  @Public()
  @Post('materialize')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Materialize review cases from OptimizationShadowEvent records',
  })
  @ApiBody({ type: MaterializeShadowReviewsDto })
  async materialize(@Body() body: MaterializeShadowReviewsDto) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowReview) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowReviewService unavailable');
    }
    const result = await this.shadowReview.materialize(body);
    return successResponse(result);
  }

  @Public()
  @Get('queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pending / in-progress shadow review cases (blinded)' })
  async getQueue(
    @Query('status') status?: ShadowReviewCaseStatus,
    @Query('tripId') tripId?: string,
    @Query('limit') limit?: string,
  ) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowReview) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowReviewService unavailable');
    }
    const n = limit ? Number(limit) : undefined;
    return successResponse({
      items: await this.shadowReview.getQueue({
        status,
        tripId: tripId?.trim() || undefined,
        limit: n,
      }),
    });
  }

  @Public()
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Aggregate manual review outcomes (server-unblinded)' })
  async getStats() {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowReview) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowReviewService unavailable');
    }
    try {
      return successResponse(await this.shadowReview.getStats());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Cannot decrypt blind mapping')) {
        return errorResponse(ErrorCode.INTERNAL_ERROR, message);
      }
      return errorResponse(ErrorCode.INTERNAL_ERROR, message);
    }
  }

  @Public()
  @Get(':reviewCaseId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Single blinded review case (options A/B only)' })
  async getCase(@Param('reviewCaseId') reviewCaseId: string) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowReview) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowReviewService unavailable');
    }
    const view = await this.shadowReview.getCase(reviewCaseId);
    if (!view) {
      throw new NotFoundException(`Review case not found: ${reviewCaseId}`);
    }
    return successResponse(view);
  }

  @Public()
  @Post(':reviewCaseId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit blind manual review (no strategy classification from client)' })
  @ApiBody({ type: SubmitShadowReviewDto })
  async submit(
    @Param('reviewCaseId') reviewCaseId: string,
    @Body() body: SubmitShadowReviewDto,
    @Headers('x-shadow-reviewer-id') reviewerHeader?: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    if (!isShadowObservabilityEnabled()) {
      return errorResponse(ErrorCode.BUSINESS_ERROR, 'Shadow observability disabled');
    }
    if (!this.shadowReview) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'ShadowReviewService unavailable');
    }
    const raw = body as unknown as Record<string, unknown>;
    if (raw.preferredStrategy != null || raw.classification != null) {
      return errorResponse(
        ErrorCode.VALIDATION_ERROR,
        'preferredStrategy and classification are not accepted — submit preferredOption A/B only',
      );
    }

    const reviewerId = body.reviewerId?.trim() || reviewerHeader?.trim() || 'anonymous-reviewer';

    try {
      const input: SubmitShadowReviewInput = {
        preferredOption: body.preferredOption,
        scores: body.scores,
        tradeOffSummary: body.tradeOffSummary,
        confidence: body.confidence,
        reviewerId,
        idempotencyKey: idempotencyKey?.trim() || undefined,
      };
      return successResponse(await this.shadowReview.submitReview(reviewCaseId, input));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found')) {
        throw new NotFoundException(message);
      }
      if (
        err instanceof Error &&
        (err.name === 'ShadowBlindMappingDecryptError' ||
          message.includes('Cannot decrypt blind mapping'))
      ) {
        return errorResponse(
          ErrorCode.INTERNAL_ERROR,
          message,
        );
      }
      return errorResponse(ErrorCode.BUSINESS_ERROR, message);
    }
  }
}
