import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ActionCommitRequestDto,
  ActionExecutionResponseDto,
  ActionExecutionItemDto,
  ActionPreviewRequestDto,
  ActionRollbackRequestDto,
} from '../dto/action-execution.dto';
import { RequestDeduplicationService } from './request-deduplication.service';
import {
  ACTION_REJECT_REASON_CODES,
  ACTION_REJECT_REASON_MESSAGES,
  ActionRejectReasonCode,
  TRAVEL_ONTOLOGY_MERGE_POLICY,
} from '../constants/action-execution.constants';
import { ActionRegistryService } from './action-registry.service';
import { AgentEventType, EventTelemetryService } from './event-telemetry.service';

@Injectable()
export class ActionExecutionService {
  private readonly logger = new Logger(ActionExecutionService.name);
  private readonly actionNameMapping: Record<string, string> = {
    'BOOK:FLIGHT': 'trip.apply_user_edit',
    'BOOK:HOTEL': 'trip.apply_user_edit',
    'BOOK:ACTIVITY': 'trip.apply_user_edit',
    'BOOK:ITINERARY': 'trip.apply_user_edit',
    'BOOK:TRANSPORT': 'trip.apply_user_edit',
    'CANCEL:FLIGHT': 'trip.apply_user_edit',
    'CANCEL:HOTEL': 'trip.apply_user_edit',
    'CANCEL:ACTIVITY': 'trip.apply_user_edit',
    'CANCEL:ITINERARY': 'trip.apply_user_edit',
    'CANCEL:TRANSPORT': 'trip.apply_user_edit',
    'ADJUST:FLIGHT': 'trip.apply_user_edit',
    'ADJUST:HOTEL': 'trip.apply_user_edit',
    'ADJUST:ACTIVITY': 'trip.apply_user_edit',
    'ADJUST:TRANSPORT': 'trip.apply_user_edit',
    'ADJUST:ITINERARY': 'execution.handle_change',
    'PAY:FLIGHT': 'trip.apply_user_edit',
    'PAY:HOTEL': 'trip.apply_user_edit',
    'PAY:ACTIVITY': 'trip.apply_user_edit',
    'PAY:TRANSPORT': 'trip.apply_user_edit',
    'PAY:ITINERARY': 'trip.apply_user_edit',
    'NOTIFY:ITINERARY': 'execution.remind',
    'NOTIFY:FLIGHT': 'execution.remind',
    'NOTIFY:HOTEL': 'execution.remind',
    'OPTIMIZE:ITINERARY': 'planning.workbench.generate',
  };

  constructor(
    @Optional() private readonly requestDeduplication?: RequestDeduplicationService,
    @Optional() private readonly actionRegistry?: ActionRegistryService,
    @Optional() private readonly eventTelemetry?: EventTelemetryService,
  ) {}

  async preview(request: ActionPreviewRequestDto): Promise<ActionExecutionResponseDto> {
    this.logger.debug(`[ActionExecution] preview request_id=${request.request_id}, trip_id=${request.trip_id}`);
    const mode = request.execution_mode || 'ADVICE_ONLY';
    const proposedActions = request.actions?.length ? request.actions : (request.action_plan || []);
    const actionsWithPolicy = proposedActions.map((action) => ({
      ...action,
      requires_confirmation: this.requiresConfirmationByMode(action.risk_level, mode),
    }));
    const response: ActionExecutionResponseDto = {
      status: 'OK',
      message: `Action preview generated with ${mode} confirmation policy.`,
      accepted_actions: actionsWithPolicy,
      requires_confirmation_count: actionsWithPolicy.filter((a) => a.requires_confirmation).length,
      high_risk_count: actionsWithPolicy.filter((a) => a.risk_level === 'HIGH').length,
    };
    this.eventTelemetry?.recordEvent({
      type: AgentEventType.SYSTEM2_STEP,
      request_id: request.request_id,
      data: {
        action_api: 'preview',
        execution_mode: mode,
        action_count: actionsWithPolicy.length,
        requires_confirmation_count: response.requires_confirmation_count,
        high_risk_count: response.high_risk_count,
      },
    });
    return response;
  }

  async commit(request: ActionCommitRequestDto): Promise<ActionExecutionResponseDto> {
    this.logger.debug(
      `[ActionExecution] commit request_id=${request.request_id}, trip_id=${request.trip_id}, actions=${request.actions.length}`,
    );
    const dedupKey = this.buildCommitDedupKey(request);
    const cached = this.requestDeduplication?.checkGenericDuplicate<ActionExecutionResponseDto>(dedupKey);
    if (cached) {
      const response = {
        ...cached,
        message: 'Action commit deduplicated (idempotent hit).',
      };
      this.eventTelemetry?.recordEvent({
        type: AgentEventType.SYSTEM2_STEP,
        request_id: request.request_id,
        data: {
          action_api: 'commit',
          deduplicated: true,
          status: response.status,
        },
      });
      return response;
    }

    const highRiskWithoutConfirmation = request.actions.filter(
      (action) => action.risk_level === 'HIGH' && action.requires_confirmation,
    );
    if (highRiskWithoutConfirmation.length > 0 && !request.confirmation_token) {
      const acceptedActions = request.actions.filter(
        (action) => !(action.risk_level === 'HIGH' && action.requires_confirmation),
      );
      return {
        status: 'PARTIAL',
        message: 'High-risk actions require confirmation_token. Commit not executed for those actions.',
        accepted_actions: acceptedActions,
        blocked_actions: highRiskWithoutConfirmation.map((action) =>
          this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN),
        ),
        rejected_reason_codes: [ACTION_REJECT_REASON_CODES.HIGH_RISK_REQUIRES_CONFIRMATION_TOKEN],
      };
    }

    const acceptedActions: ActionCommitRequestDto['actions'] = [];
    const blockedActions: ActionCommitRequestDto['actions'] = [];
    const rejectedReasonCodes = new Set<string>();
    for (const action of request.actions) {
      const effectiveVerb = this.normalizeVerbForMapping(action.action_type);
      const actionName = action.action_name || this.mapActionName(effectiveVerb, action.target_type);
      if (!actionName) {
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.UNSUPPORTED_ACTION_MAPPING));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.UNSUPPORTED_ACTION_MAPPING);
        continue;
      }
      if (!this.actionRegistry || !this.actionRegistry.has(actionName)) {
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.ACTION_NOT_REGISTERED));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.ACTION_NOT_REGISTERED);
        continue;
      }
      const preconditionOk = this.actionRegistry.checkPreconditions(actionName, {
        trip: { trip_id: request.trip_id },
        request_id: request.request_id,
        trip_id: request.trip_id,
      });
      if (!preconditionOk) {
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.ACTION_PRECONDITION_FAILED));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.ACTION_PRECONDITION_FAILED);
        continue;
      }

      try {
        const registered = this.actionRegistry.get(actionName);
      const builtInput = this.buildActionInput(actionName, action, request.trip_id, effectiveVerb);
      if (builtInput.rejectReasonCode) {
        blockedActions.push(this.withRejectedReason(action, builtInput.rejectReasonCode));
        rejectedReasonCodes.add(builtInput.rejectReasonCode);
        continue;
      }
      const actionInput = builtInput.input;
        const executionResult = await registered?.execute(actionInput, {
          trip: { trip_id: request.trip_id },
          request_id: request.request_id,
          trip_id: request.trip_id,
        });
        if (executionResult && typeof executionResult === 'object' && 'success' in executionResult && executionResult.success === false) {
          throw new Error(`Action returned unsuccessful result: ${JSON.stringify(executionResult)}`);
        }
        acceptedActions.push(action);
      } catch (error: any) {
        this.logger.warn(
          `[ActionExecution] action execution failed: action_name=${actionName}, action_id=${action.action_id}, error=${error?.message || String(error)}`,
        );
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.ACTION_EXECUTION_FAILED));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.ACTION_EXECUTION_FAILED);
      }
    }

    const response: ActionExecutionResponseDto = {
      status: blockedActions.length > 0 ? 'PARTIAL' : 'OK',
      message:
        blockedActions.length > 0
          ? 'Action commit partially executed. Some actions were blocked.'
          : 'Action commit executed.',
      accepted_actions: acceptedActions,
      blocked_actions: blockedActions.length > 0 ? blockedActions : undefined,
      rejected_reason_codes: blockedActions.length > 0 ? Array.from(rejectedReasonCodes) as any : undefined,
      ...this.buildTravelOntologyCommitExtension(request.trip_id, acceptedActions),
    };
    this.requestDeduplication?.cacheGenericResponse(dedupKey, response);
    this.eventTelemetry?.recordEvent({
      type: AgentEventType.SYSTEM2_STEP,
      request_id: request.request_id,
      data: {
        action_api: 'commit',
        status: response.status,
        accepted_count: response.accepted_actions?.length || 0,
        blocked_count: response.blocked_actions?.length || 0,
        rejected_reason_codes: response.rejected_reason_codes || [],
      },
    });
    return response;
  }

  async rollback(request: ActionRollbackRequestDto): Promise<ActionExecutionResponseDto> {
    this.logger.debug(
      `[ActionExecution] rollback request_id=${request.request_id}, trip_id=${request.trip_id}, action_ids=${request.action_ids.length}`,
    );
    const response: ActionExecutionResponseDto = {
      status: 'OK',
      message: 'Rollback accepted (stub, no side effects).',
      accepted_actions: [],
    };
    this.eventTelemetry?.recordEvent({
      type: AgentEventType.SYSTEM2_STEP,
      request_id: request.request_id,
      data: {
        action_api: 'rollback',
        status: response.status,
        action_count: request.action_ids.length,
      },
    });
    return response;
  }

  /**
   * commit 成功后返回与 route_and_run 同构的 travelOntologyState 增量（verbs.committed）。
   */
  private buildTravelOntologyCommitExtension(
    tripId: string,
    acceptedActions: ActionCommitRequestDto['actions'],
  ): Pick<ActionExecutionResponseDto, 'travel_ontology'> {
    const ids = acceptedActions.map((a) => a.action_id).filter(Boolean);
    if (!ids.length) {
      return {};
    }
    return {
      travel_ontology: {
        trip_id: tripId,
        patch: {
          tripId,
          verbs: { committed: ids },
        },
        merge_policy: TRAVEL_ONTOLOGY_MERGE_POLICY,
      },
    };
  }

  private buildCommitDedupKey(request: ActionCommitRequestDto): string {
    const actionFingerprints = request.actions
      .map((a) => `${a.action_id}|${a.action_type}|${a.target_type}|${a.target_ref ?? ''}`)
      .sort();
    const idempotencyPrefix = request.idempotency_key || request.request_id;
    return `${idempotencyPrefix}::${request.trip_id}::${actionFingerprints.join(',')}`;
  }

  private requiresConfirmationByMode(
    risk: 'LOW' | 'MEDIUM' | 'HIGH',
    mode: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO',
  ): boolean {
    if (mode === 'ADVICE_ONLY') return true;
    if (mode === 'SEMI_AUTO') return risk !== 'LOW';
    return risk === 'HIGH';
  }

  /**
   * 本体层 MODIFY / SELECT 与内核 ADJUST 对齐（映射表仅维护内核动词）。
   */
  private normalizeVerbForMapping(raw: string): string {
    const u = String(raw || '').toUpperCase();
    if (u === 'MODIFY' || u === 'SELECT') return 'ADJUST';
    return u;
  }

  private mapActionName(
    actionType: string,
    targetType: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY',
  ): string | null {
    return this.actionNameMapping[`${actionType}:${targetType}`] || null;
  }

  private withRejectedReason(
    action: ActionCommitRequestDto['actions'][number],
    reason: ActionRejectReasonCode,
  ): ActionExecutionItemDto {
    return {
      ...action,
      rejected_reason_code: reason,
      rejected_message: ACTION_REJECT_REASON_MESSAGES[reason],
    };
  }

  private buildActionInput(
    actionName: string,
    action: ActionCommitRequestDto['actions'][number],
    tripId: string,
    effectiveVerb: string,
  ): { input: Record<string, any>; rejectReasonCode?: ActionRejectReasonCode } {
    const actionInput = action.action_input;
    if (actionName !== 'trip.apply_user_edit') {
      return { input: actionInput || {} };
    }
    const edits = actionInput?.edits && Array.isArray(actionInput.edits)
      ? actionInput.edits
      : this.buildDefaultEdits(action, effectiveVerb);
    if (effectiveVerb === 'BOOK' && (action.target_type === 'ITINERARY' || action.target_type === 'ACTIVITY')) {
      const firstEdit = edits[0] || {};
      const missing = ['placeId', 'tripDayId', 'startTime', 'endTime'].filter((k) => !firstEdit[k]);
      if (missing.length > 0) {
        return {
          input: {},
          rejectReasonCode: ACTION_REJECT_REASON_CODES.BOOK_ADD_MISSING_REQUIRED_FIELDS,
        };
      }
    }
    return {
      input: {
        ...(actionInput || {}),
        trip_id: actionInput?.trip_id || tripId,
        edits,
      },
    };
  }

  private buildDefaultEdits(
    action: ActionCommitRequestDto['actions'][number],
    effectiveVerb: string,
  ): Array<Record<string, any>> {
    const fallbackItemId = action.target_ref || action.action_id;

    if (effectiveVerb === 'CANCEL') {
      return [{ type: 'delete', itemId: fallbackItemId }];
    }

    if (effectiveVerb === 'BOOK') {
      if (action.target_type === 'ITINERARY' || action.target_type === 'ACTIVITY') {
        return [
          {
            type: 'add',
            placeId: action.action_input?.placeId,
            tripDayId: action.action_input?.tripDayId,
            startTime: action.action_input?.startTime,
            endTime: action.action_input?.endTime,
          },
        ];
      }
      return [
        {
          type: 'update',
          itemId: fallbackItemId,
          updates: {
            bookingStatus: 'BOOKED',
            bookingRef: action.target_ref || null,
          },
        },
      ];
    }

    if (effectiveVerb === 'PAY') {
      const extra =
        action.action_input?.updates && typeof action.action_input.updates === 'object'
          ? action.action_input.updates
          : {};
      return [{ type: 'update', itemId: fallbackItemId, updates: { paymentStatus: 'PAID', ...extra } }];
    }

    return [{ type: 'update', itemId: fallbackItemId, updates: action.action_input?.updates || {} }];
  }
}
