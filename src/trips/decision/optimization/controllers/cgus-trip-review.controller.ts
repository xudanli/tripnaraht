/**
 * CGUS Trip Review — Outcome Loop HTTP 入口（OPS-CGUS-01/02/03）。
 * 不碰 EU 公式；仅回写 Action / Outcome / Diagnosis。
 */

import { Body, Controller, Get, Optional, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../../auth/decorators/public.decorator';
import { successResponse, errorResponse, ErrorCode } from '../../../../common/dto/standard-response.dto';
import { DecisionKernelService } from '../../../../decision/kernel/decision-kernel.service';
import type { CgusOutcomeLoopWritePayload } from '../cgus-trip-review.util';

@ApiTags('CGUS Trip Review')
@Controller('decision/cgus/trip-review')
export class CgusTripReviewController {
  constructor(@Optional() private readonly decisionKernel?: DecisionKernelService) {}

  @Public()
  @Get(':tripRunId')
  @ApiOperation({ summary: '读取 CGUS Trip Review（推荐 vs 用户选择 vs Outcome）' })
  @ApiQuery({ name: 'decision_id', required: false })
  async getReview(
    @Param('tripRunId') tripRunId: string,
    @Query('decision_id') decision_id?: string,
  ) {
    if (!this.decisionKernel) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'DecisionKernel not available');
    }
    const out = await this.decisionKernel.getCgusTripReview({ tripRunId, decision_id });
    if (!out.ok) {
      return errorResponse(ErrorCode.BAD_REQUEST, out.error ?? 'failed');
    }
    return successResponse(out);
  }

  @Public()
  @Post(':tripRunId/action')
  @ApiOperation({
    summary: 'OPS-CGUS-01：回写 user_action / chosen_candidate',
    description: 'ACCEPT | OVERRIDE | REJECT_ALL | NO_ACTION。Override ≠ failure。',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['user_action'],
      properties: {
        decision_id: { type: 'string' },
        user_action: {
          type: 'string',
          enum: ['ACCEPT', 'OVERRIDE', 'REJECT_ALL', 'NO_ACTION'],
        },
        chosen_candidate: { type: 'string' },
        override_reason: { type: 'string' },
      },
    },
  })
  async writeAction(
    @Param('tripRunId') tripRunId: string,
    @Body()
    body: {
      decision_id?: string;
      user_action: 'ACCEPT' | 'OVERRIDE' | 'REJECT_ALL' | 'NO_ACTION';
      chosen_candidate?: string;
      override_reason?: string;
    },
  ) {
    return this.write(tripRunId, body.decision_id, {
      kind: 'action',
      user_action: body.user_action,
      chosen_candidate: body.chosen_candidate,
      override_reason: body.override_reason,
    });
  }

  @Public()
  @Post(':tripRunId/outcome')
  @ApiOperation({
    summary: 'OPS-CGUS-02：回写 actual_outcome / decision_regret',
    description: 'Outcome 与 Regret 分列；Override ≠ Regret。可行程结束后补写。',
  })
  async writeOutcome(
    @Param('tripRunId') tripRunId: string,
    @Body()
    body: {
      decision_id?: string;
      actual_outcome: {
        completed: boolean;
        safetyIncident: boolean;
        majorDelayMinutes?: number;
        unexpectedCost?: number;
        userReportedIssue?: string;
      };
      decision_regret: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
    },
  ) {
    return this.write(tripRunId, body.decision_id, {
      kind: 'outcome',
      actual_outcome: body.actual_outcome,
      decision_regret: body.decision_regret,
    });
  }

  @Public()
  @Post(':tripRunId/diagnosis')
  @ApiOperation({
    summary: 'OPS-CGUS-03：Trip Review Diagnosis',
    description: '运营勾选 problematic + root_cause；非自动 AI Judge。',
  })
  async writeDiagnosis(
    @Param('tripRunId') tripRunId: string,
    @Body()
    body: {
      decision_id?: string;
      recommendation_problematic: 'NO' | 'YES' | 'UNSURE';
      root_cause?:
        | 'STATE'
        | 'EVIDENCE'
        | 'FEASIBILITY'
        | 'UTILITY'
        | 'WEIGHT'
        | 'UX'
        | 'CAPABILITY_BOUNDARY'
        | 'NONE'
        | 'UNKNOWN';
      review_note?: string;
      reviewed_by: string;
    },
  ) {
    return this.write(tripRunId, body.decision_id, {
      kind: 'diagnosis',
      recommendation_problematic: body.recommendation_problematic,
      root_cause: body.root_cause,
      review_note: body.review_note,
      reviewed_by: body.reviewed_by,
    });
  }

  private async write(
    tripRunId: string,
    decision_id: string | undefined,
    payload: CgusOutcomeLoopWritePayload,
  ) {
    if (!this.decisionKernel) {
      return errorResponse(ErrorCode.INTERNAL_ERROR, 'DecisionKernel not available');
    }
    const out = await this.decisionKernel.writeCgusDecisionOutcomeLoop({
      tripRunId,
      decision_id,
      payload,
    });
    if (!out.ok) {
      return errorResponse(ErrorCode.BAD_REQUEST, out.error ?? 'writeback failed');
    }
    return successResponse(out);
  }
}
