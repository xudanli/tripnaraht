import { Body, Controller, Inject, HttpCode, HttpStatus, Optional, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  ActionCommitRequestDto,
  ActionExecutionResponseDto,
  ActionPreviewRequestDto,
  ActionRollbackRequestDto,
} from './dto/action-execution.dto';
import { ActionExecutionService } from './services/action-execution.service';
import type { IDsoFeedbackPersistence } from '../decision/kernel/dso-feedback-persistence.interface';
import { DSO_FEEDBACK_PERSISTENCE } from '../decision/kernel/dso-feedback-persistence.interface';
import type { DecisionState } from '../decision/kernel/decision-state.types';
import { projectJepaZStateFromDecisionState } from './services/jepa-z-state.projection';

@ApiTags('agent-actions')
@ApiBearerAuth()
@Controller('agent/actions')
export class ActionsController {
  constructor(
    private readonly actionExecutionService: ActionExecutionService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly dsoFeedbackPersistence?: IDsoFeedbackPersistence,
  ) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview action execution plan' })
  @ApiBody({ type: ActionPreviewRequestDto })
  @ApiResponse({
    status: 200,
    type: ActionExecutionResponseDto,
    description: 'Preview generated with confirmation policy and action risk summary.',
    schema: {
      example: {
        status: 'OK',
        message: 'Action preview generated with SEMI_AUTO confirmation policy.',
        accepted_actions: [
          {
            action_id: 'a1',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            target_ref: 'flight_CA1234_2026-04-01',
            risk_level: 'HIGH',
            requires_confirmation: true,
          },
        ],
        requires_confirmation_count: 1,
        high_risk_count: 1,
      },
    },
  })
  async preview(@Body() request: ActionPreviewRequestDto): Promise<ActionExecutionResponseDto> {
    return this.actionExecutionService.preview(request);
  }

  @Post('commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Commit action execution plan' })
  @ApiBody({ type: ActionCommitRequestDto })
  @ApiResponse({
    status: 200,
    type: ActionExecutionResponseDto,
    description: 'Commit accepted, partially accepted, or deduplicated by idempotency key.',
    schema: {
      example: {
        status: 'OK',
        message: 'Action commit executed.',
        accepted_actions: [
          {
            action_id: 'act_1',
            action_type: 'BOOK',
            target_type: 'FLIGHT',
            risk_level: 'LOW',
            requires_confirmation: false,
          },
        ],
        travel_ontology: {
          trip_id: 'trip_001',
          patch: { tripId: 'trip_001', verbs: { committed: ['act_1'] } },
          merge_policy: 'deep_merge_verbs_committed_union',
        },
      },
    },
  })
  async commit(@Body() request: ActionCommitRequestDto): Promise<ActionExecutionResponseDto> {
    // 若缺少 DSO 持久化能力，则退化为原有行为
    if (!this.dsoFeedbackPersistence) {
      return this.actionExecutionService.commit(request);
    }

    const tripId = request.trip_id;
    const requestId = request.request_id;
    const traceId = request.idempotency_key ?? request.request_id;

    // 1) 动作前：取 DSO → 计算 z_state 快照 → 写入 DecisionState.history
    const dsoBefore: DecisionState | undefined = await this.dsoFeedbackPersistence.getDso(tripId);
    if (dsoBefore) {
      const zStateBefore = projectJepaZStateFromDecisionState(dsoBefore);
      const now = new Date().toISOString();
      dsoBefore.history = [
        ...(dsoBefore.history ?? []),
        {
          type: 'jepa_z_state_before_action',
          summary: `before action commit (${request.actions.length} action(s))`,
          at: now,
          prev: zStateBefore,
          meta: {
            request_id: requestId,
            trace_id: traceId,
            version: dsoBefore.systemState?.version,
          },
        },
      ];
      await this.dsoFeedbackPersistence.persistDso(tripId, dsoBefore);
    }

    // 2) 执行动作 commit
    const actionResult = await this.actionExecutionService.commit(request);

    // 3) 动作后：取 DSO → 合并 travelOntology verbs(如果有) → 重新计算 z_state 快照 → 写入 history
    const dsoAfter: DecisionState | undefined = await this.dsoFeedbackPersistence.getDso(tripId);
    if (dsoAfter) {
      // actionResult 只返回 travel_ontology 的 verbs.committed 增量（客户端可用 merge_policy 深合并）
      const committedIds = actionResult.travel_ontology?.patch?.verbs?.committed ?? [];
      const travel = dsoAfter.travelOntologyState ?? { verbs: {}, nouns: {}, tripId };
      const existingCommitted = travel.verbs?.committed ?? [];
      const mergedCommitted = Array.from(new Set([...(existingCommitted ?? []), ...committedIds]));
      dsoAfter.travelOntologyState = {
        ...travel,
        tripId,
        nouns: travel.nouns ?? {},
        verbs: {
          ...(travel.verbs ?? {}),
          committed: mergedCommitted,
        },
      };

      const zStateAfter = projectJepaZStateFromDecisionState(dsoAfter);
      const now = new Date().toISOString();
      dsoAfter.history = [
        ...(dsoAfter.history ?? []),
        {
          type: 'jepa_z_state_after_action',
          summary: `after action commit (status=${actionResult.status})`,
          at: now,
          next: zStateAfter,
          meta: {
            request_id: requestId,
            trace_id: traceId,
            version: dsoAfter.systemState?.version,
            status: actionResult.status,
          },
        },
      ];
      await this.dsoFeedbackPersistence.persistDso(tripId, dsoAfter);
    }

    return actionResult;
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rollback committed actions' })
  @ApiBody({ type: ActionRollbackRequestDto })
  @ApiResponse({
    status: 200,
    type: ActionExecutionResponseDto,
    description: 'Rollback accepted for action ids.',
    schema: {
      example: {
        status: 'OK',
        message: 'Rollback accepted (stub, no side effects).',
        accepted_actions: [],
      },
    },
  })
  async rollback(@Body() request: ActionRollbackRequestDto): Promise<ActionExecutionResponseDto> {
    return this.actionExecutionService.rollback(request);
  }
}
