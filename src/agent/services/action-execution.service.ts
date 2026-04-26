import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
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
import type { Action } from '../interfaces/action.interface';
import { ActionRegistryService } from './action-registry.service';
import { AgentEventType, EventTelemetryService } from './event-telemetry.service';
import { SideEffectRegistryService } from './side-effect-registry.service';
import { FinancialHoldSideEffect } from '../actions/side-effects/financial-hold.side-effect';
import { SideEffectParamResolverService } from './side-effect-param-resolver.service';
import { AgentActionLogService } from './agent-action-log.service';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';
import { DecisionContractV1, sha256Signature, type PhysicsFactV1 } from '../contracts/decision-contract.types';
import { DecisionContractCapturerService } from './decision-contract-capturer.service';
import type { AgentService } from './agent.service';

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
    @Optional() private readonly sideEffectRegistry?: SideEffectRegistryService,
    @Optional() private readonly eventTelemetry?: EventTelemetryService,
    @Optional() private readonly sideEffectParamResolver?: SideEffectParamResolverService,
    @Optional() private readonly agentActionLog?: AgentActionLogService,
    @Optional() private readonly contractCapturer?: DecisionContractCapturerService,
    @Optional() private readonly moduleRef?: ModuleRef,
  ) {
    // v1 bootstrap: register built-in side effects when registry is available.
    this.sideEffectRegistry?.register(FinancialHoldSideEffect);
  }

  private getAgentService(): AgentService | null {
    try {
      const svc = this.moduleRef?.get?.('AgentService' as any, { strict: false }) as any;
      return svc ?? null;
    } catch {
      return null;
    }
  }

  private async buildDecisionContractV1(params: {
    tripId: string;
    actionName: string;
    action: ActionCommitRequestDto['actions'][number];
    sideEffectConfigs: Array<{ handlerId: string; params?: Record<string, any> }>;
    // best-effort preview snapshot (may be undefined when action is unknown)
    shadowDelta?: unknown;
    /** When set (e.g. post-heal replay), folds into constraint_hash so the contract signature moves with enforced world constraints. */
    emergency_constraints?: Record<string, unknown> | null;
  }): Promise<DecisionContractV1> {
    const action_input = params.action.action_input ?? null;
    const side_effect_configs = params.sideEffectConfigs ?? [];

    // Budget/Hold extraction (v1): derive hold amount/currency from action_input + FINANCIAL_HOLD params.
    const holdCfg = side_effect_configs.find((c) => String(c.handlerId) === 'side_effect.financial_hold.book_flight_v1');
    const hold_ratio =
      holdCfg && typeof holdCfg.params?.hold_ratio === 'number' && Number.isFinite(holdCfg.params.hold_ratio)
        ? Number(holdCfg.params.hold_ratio)
        : 1.0;
    const ttl_seconds =
      holdCfg && typeof holdCfg.params?.ttl_seconds === 'number' && Number.isFinite(holdCfg.params.ttl_seconds)
        ? Number(holdCfg.params.ttl_seconds)
        : 15 * 60;
    const rawAmount =
      action_input && ((action_input as any).amount != null || (action_input as any).price != null)
        ? Number((action_input as any).amount ?? (action_input as any).price)
        : null;
    const hold_amount =
      rawAmount != null && Number.isFinite(rawAmount) ? rawAmount * hold_ratio : null;
    const currency =
      action_input && (action_input as any).currency != null ? String((action_input as any).currency) : undefined;

    const constraint_hash = sha256Signature({
      action_name: params.actionName,
      side_effect_configs,
      ...(params.emergency_constraints && Object.keys(params.emergency_constraints).length
        ? { emergency_constraints: params.emergency_constraints }
        : {}),
    });
    const env_hash = sha256Signature({
      // Use preview shadow delta as env surrogate for resource state snapshot.
      shadow_delta: params.shadowDelta ?? null,
      wallet: action_input && typeof (action_input as any).wallet === 'object' ? (action_input as any).wallet : null,
    });
    const risk_profile_hash =
      action_input && (action_input as any).wallet && typeof (action_input as any).wallet === 'object'
        ? sha256Signature({ wallet: (action_input as any).wallet })
        : undefined;

    const allowed_variance = [
      // v1: allow tiny rounding drift for money deltas
      { metric: 'budget.hold_amount', op: 'abs_delta_lte', threshold: 1, unit: currency ?? 'UNKNOWN' } as const,
      // v1.1 (physics): allow tiny drift for wind/visibility/sunset offsets when present
      { metric: 'wind_speed_mps', op: 'abs_delta_lte', threshold: 1, unit: 'm/s' } as const,
      { metric: 'visibility_meters', op: 'abs_delta_lte', threshold: 50, unit: 'm' } as const,
      { metric: 'sunset_offset_min', op: 'abs_delta_lte', threshold: 10, unit: 'min' } as const,
      // v1.2 (human factors): fatigue / walking intensity (soft by default)
      { metric: 'fatigue_index', op: 'abs_delta_lte', threshold: 0.1, unit: 'fatigue_index' } as const,
      { metric: 'fatigue_overloaded_days', op: 'abs_delta_lte', threshold: 0, unit: 'days' } as const,
    ];

    const expected_state_delta: DecisionContractV1['expected_state_delta'] = {
      deltas:
        hold_amount != null
          ? [
              { path: '$.budget.locked', op: 'inc', value: hold_amount, ...(currency ? { unit: currency } : {}) },
              { path: '$.budget.available', op: 'dec', value: hold_amount, ...(currency ? { unit: currency } : {}) },
              {
                path: `$.holds.hold_${String(params.action.action_id ?? '')}.expires_at`,
                op: 'set',
                value: `ttl:${ttl_seconds}s`,
              },
            ]
          : [],
    };

    const captured = this.contractCapturer
      ? await this.contractCapturer.captureFeasibilitySnapshot({ tripId: params.tripId, lookbackMinutes: 90, take: 80 })
      : null;

    return {
      version: 'v1',
      semantic_signature: {
        env_hash,
        constraint_hash,
        ...(risk_profile_hash ? { risk_profile_hash } : {}),
        ...(captured
          ? {
              feasibility_snapshot: {
                feasible: captured.feasible,
                hard_violation_count: captured.hard_violation_count,
                violated_rules: captured.violated_rules,
              },
            }
          : { feasibility_snapshot: { feasible: true } }),
      },
      allowed_variance: allowed_variance as any,
      expected_state_delta,
      ...(captured?.evidence_refs?.length ? { evidence_refs: captured.evidence_refs } : {}),
      ...(captured?.facts?.length
        ? {
            physics_facts: (captured.facts.slice(0, 20) as any[]).map((f) => ({
              rule_id: String((f as any).rule_id),
              actual_value: (f as any).actual_value ?? null,
              threshold: (f as any).threshold ?? null,
              unit: (f as any).unit ?? undefined,
              is_violated: Boolean((f as any).is_violated),
              severity: (f as any).severity ?? undefined,
              evidence: (f as any).evidence ?? undefined,
              at: (f as any).at ?? undefined,
            })) as PhysicsFactV1[],
          }
        : {}),
    };
  }

  async preview(request: ActionPreviewRequestDto): Promise<ActionExecutionResponseDto> {
    this.logger.debug(`[ActionExecution] preview request_id=${request.request_id}, trip_id=${request.trip_id}`);
    const mode = request.execution_mode || 'ADVICE_ONLY';
    const proposedActions = request.actions?.length ? request.actions : (request.action_plan || []);
    const actionsWithPolicy = proposedActions.map((action) => ({
      ...action,
      requires_confirmation: this.requiresConfirmationByMode(action.risk_level, mode),
    }));
    const registry = this.actionRegistry;
    const action_previews =
      registry && actionsWithPolicy.length > 0
        ? await Promise.all(actionsWithPolicy.map(async (a) => {
            const effectiveVerb = this.normalizeVerbForMapping(a.action_type);
            const actionName = a.action_name || this.mapActionName(effectiveVerb, a.target_type);
            if (!actionName || !registry.has(actionName)) {
              const context_signature = sha256Signature({
                action_id: a.action_id,
                action_name: actionName ?? null,
                action_type: a.action_type,
                target_type: a.target_type,
                target_ref: a.target_ref,
                action_input: a.action_input ?? null,
                assessment: {
                  status: 'blocked',
                  findings: [
                    {
                      code: 'UNKNOWN',
                      severity: 'BLOCK',
                      message: actionName ? `Action not registered: ${actionName}` : 'Missing action_name mapping',
                    },
                  ],
                  shadow_delta: null,
                },
              });
              return {
                action_id: a.action_id,
                status: 'blocked' as const,
                preconditions: [
                  {
                    code: 'UNKNOWN',
                    severity: 'BLOCK' as const,
                    message: actionName ? `Action not registered: ${actionName}` : 'Missing action_name mapping',
                  },
                ],
                context_signature,
              };
            }
            const assessment = registry.checkPreconditions(
              actionName,
              {
                trip: { trip_id: request.trip_id },
                request_id: request.request_id,
                trip_id: request.trip_id,
                ...(a.action_input && typeof (a.action_input as any).wallet === 'object' ? { wallet: (a.action_input as any).wallet } : {}),
              },
              a.action_input,
            );
            const actionDef = registry.get(actionName);
            const sideEffectConfigs = this.buildSideEffectConfigs(actionName, actionDef);
            const side_effects = this.sideEffectRegistry && sideEffectConfigs.length > 0
              ? await this.sideEffectRegistry.previewMany(
                  {
                    request_id: request.request_id,
                    trip_id: request.trip_id,
                    action_id: a.action_id,
                    action_name: actionName,
                    action_type: a.action_type,
                    target_type: a.target_type,
                    target_ref: a.target_ref,
                    action_input: a.action_input,
                    state: {
                      trip: { trip_id: request.trip_id },
                      request_id: request.request_id,
                      trip_id: request.trip_id,
                      ...(a.action_input && typeof (a.action_input as any).wallet === 'object'
                        ? { wallet: (a.action_input as any).wallet }
                        : {}),
                    },
                  },
                  sideEffectConfigs,
                )
              : [];
            const context_signature = sha256Signature({
              action_id: a.action_id,
              action_name: actionName,
              action_type: a.action_type,
              target_type: a.target_type,
              target_ref: a.target_ref,
              action_input: a.action_input ?? null,
              ...(side_effects.length ? { side_effects } : {}),
              assessment: {
                status: assessment.status,
                findings: assessment.findings ?? [],
                shadow_delta: assessment.shadow_delta ?? null,
              },
            });
            return {
              action_id: a.action_id,
              status: assessment.status,
              preconditions: assessment.findings,
              ...(assessment.shadow_delta ? { shadow_delta: assessment.shadow_delta } : {}),
              ...(side_effects.length ? { side_effects } : {}),
              context_signature,
            };
          }))
        : undefined;
    const signatureById = new Map(
      (action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), String((p as any).context_signature ?? '')]),
    );
    const shadowDeltaById = new Map((action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).shadow_delta ?? undefined]));
    const sideEffectsById = new Map((action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).side_effects ?? undefined]));
    const accepted_actions = actionsWithPolicy.map((a) => ({
      ...a,
      ...(signatureById.get(String(a.action_id ?? '')) ? { context_signature: signatureById.get(String(a.action_id ?? '')) } : {}),
      ...(shadowDeltaById.get(String(a.action_id ?? ''))
        ? { preview_snapshot: { shadow_delta: shadowDeltaById.get(String(a.action_id ?? '')) } }
        : {}),
      ...(sideEffectsById.get(String(a.action_id ?? ''))
        ? { preview_snapshot: { ...(shadowDeltaById.get(String(a.action_id ?? '')) ? { shadow_delta: shadowDeltaById.get(String(a.action_id ?? '')) } : {}), side_effects: sideEffectsById.get(String(a.action_id ?? '')) } }
        : {}),
    }));
    const response: ActionExecutionResponseDto = {
      status: 'OK',
      message: `Action preview generated with ${mode} confirmation policy.`,
      accepted_actions,
      requires_confirmation_count: actionsWithPolicy.filter((a) => a.requires_confirmation).length,
      high_risk_count: actionsWithPolicy.filter((a) => a.risk_level === 'HIGH').length,
      ...(action_previews ? { action_previews } : {}),
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
    const healingDiagnoses: any[] = [];
    const healingRecomputedPreviews: any[] = [];
    const healingPhysicalDiagnoses: any[] = [];
    const healingLegacySnapshots: any[] = [];
    let healingRouteAndRun: any | null = null;
    const responseHealingContractEvolutions: Array<{
      preview_constraint_hash: string;
      evolved_constraint_hash: string;
      evolved_decision_contract: DecisionContractV1;
    }> = [];
    for (const action of request.actions) {
      let actionContractEvolution: {
        preview_constraint_hash: string;
        evolved_constraint_hash: string;
        evolved_decision_contract: DecisionContractV1;
      } | null = null;
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

      // Two-phase lock: signature required for commit (prevents stale preview → commit drift).
      if (!String((action as any).context_signature ?? '').trim()) {
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.ACTION_PREVIEW_SIGNATURE_MISSING));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.ACTION_PREVIEW_SIGNATURE_MISSING);
        continue;
      }

      const pre = this.actionRegistry.checkPreconditions(actionName, {
        trip: { trip_id: request.trip_id },
        request_id: request.request_id,
        trip_id: request.trip_id,
        ...(action.action_input && typeof (action.action_input as any).wallet === 'object'
          ? { wallet: (action.action_input as any).wallet }
          : {}),
      }, action.action_input);
      const actionDef = this.actionRegistry.get(actionName);
      const sideEffectConfigs = this.buildSideEffectConfigs(actionName, actionDef);
      const side_effects_recomputed = this.sideEffectRegistry && sideEffectConfigs.length > 0
        ? await this.sideEffectRegistry.previewMany(
            {
              request_id: request.request_id,
              trip_id: request.trip_id,
              action_id: action.action_id,
              action_name: actionName,
              action_type: action.action_type,
              target_type: action.target_type,
              target_ref: action.target_ref,
              action_input: action.action_input,
              state: {
                trip: { trip_id: request.trip_id },
                request_id: request.request_id,
                trip_id: request.trip_id,
                ...(action.action_input && typeof (action.action_input as any).wallet === 'object'
                  ? { wallet: (action.action_input as any).wallet }
                  : {}),
              },
            },
            sideEffectConfigs,
          )
        : [];
      const recomputedSig = sha256Signature({
        action_id: action.action_id,
        action_name: actionName,
        action_type: action.action_type,
        target_type: action.target_type,
        target_ref: action.target_ref,
        action_input: action.action_input ?? null,
        ...(side_effects_recomputed.length ? { side_effects: side_effects_recomputed } : {}),
        assessment: {
          status: pre.status,
          findings: pre.findings ?? [],
          shadow_delta: pre.shadow_delta ?? null,
        },
      });
      if (String((action as any).context_signature) !== recomputedSig) {
        const originalShadowDelta = (action as any)?.preview_snapshot?.shadow_delta;
        const originalSideEffects = (action as any)?.preview_snapshot?.side_effects;
        const origAfter = originalShadowDelta?.resources?.budget?.after;
        const origCur = originalShadowDelta?.resources?.budget?.currency;
        const budgetAfter = (pre as any)?.shadow_delta?.resources?.budget?.after;
        const currency = (pre as any)?.shadow_delta?.resources?.budget?.currency;
        const baseMsg = ACTION_REJECT_REASON_MESSAGES[ACTION_REJECT_REASON_CODES.ACTION_PREVIEW_SIGNATURE_MISMATCH];
        const enrichedMsg = (() => {
          const hasCur = typeof budgetAfter === 'number' && Number.isFinite(budgetAfter) && currency;
          const hasOrig = typeof origAfter === 'number' && Number.isFinite(origAfter) && origCur;
          if (hasCur && hasOrig && String(origCur) === String(currency)) {
            return (
              `${baseMsg} ` +
              `Projected balance changed: ${origAfter} ${String(currency)} → ${budgetAfter} ${String(currency)}.`
            );
          }
          if (hasCur) {
            return `${baseMsg} Current projected balance after commit: ${budgetAfter} ${String(currency)}.`;
          }
          return baseMsg;
        })();
        blockedActions.push(
          this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.ACTION_PREVIEW_SIGNATURE_MISMATCH, {
            rejected_message: enrichedMsg,
            stale_shadow_context: {
              provided_signature: String((action as any).context_signature ?? ''),
              recomputed_signature: recomputedSig,
              ...(originalShadowDelta ? { original_shadow_delta: originalShadowDelta } : {}),
              ...(originalSideEffects ? { original_side_effects: originalSideEffects } : {}),
              recomputed_assessment: {
                status: pre.status,
                preconditions: (pre.findings ?? []) as any,
                ...(pre.shadow_delta ? { shadow_delta: pre.shadow_delta as any } : {}),
              },
            },
          }),
        );
        // Game log (ACTION_PREVIEW_STALE): emit drift evidence for training/audit.
        this.eventTelemetry?.recordEvent({
          type: AgentEventType.SYSTEM2_STEP,
          request_id: request.request_id,
          data: {
            action_api: 'commit',
            system_action: 'ACTION_PREVIEW_STALE',
            action_id: action.action_id,
            action_name: actionName,
            provided_signature: String((action as any).context_signature ?? ''),
            recomputed_signature: recomputedSig,
            original_shadow_delta: originalShadowDelta ?? null,
            recomputed_shadow_delta: pre.shadow_delta ?? null,
            original_side_effects: originalSideEffects ?? null,
            recomputed_side_effects: side_effects_recomputed ?? null,
          },
        });
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.ACTION_PREVIEW_SIGNATURE_MISMATCH);
        continue;
      }
      if (pre.status === 'blocked') {
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.ACTION_PRECONDITION_FAILED));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.ACTION_PRECONDITION_FAILED);
        continue;
      }

      let sagaLogId: string | undefined;
      let decisionContractLocal: any | null = null;
      const sagaRealizedState: Record<string, unknown> = {};
      try {
        const registered = this.actionRegistry.get(actionName);
        const builtInput = this.buildActionInput(actionName, action, request.trip_id, effectiveVerb);
        if (builtInput.rejectReasonCode) {
          blockedActions.push(this.withRejectedReason(action, builtInput.rejectReasonCode));
          rejectedReasonCodes.add(builtInput.rejectReasonCode);
          continue;
        }
        const actionInput = builtInput.input;

        const decision_contract = await this.buildDecisionContractV1({
          tripId: request.trip_id,
          actionName,
          action,
          sideEffectConfigs,
          shadowDelta: pre.shadow_delta ?? undefined,
        });
        decisionContractLocal = decision_contract as any;

        sagaLogId = await this.agentActionLog?.createInit({
          requestId: request.request_id,
          tripId: request.trip_id,
          actionId: String(action.action_id ?? ''),
          actionName,
          idempotencyKey: request.idempotency_key ?? null,
          payload: {
            action_type: action.action_type,
            target_type: action.target_type,
            target_ref: action.target_ref ?? null,
            action_input: action.action_input ?? null,
            execution_input: actionInput ?? null,
            side_effect_configs: sideEffectConfigs,
            decision_contract,
          },
        });

        const executionResult = await registered?.execute(actionInput, {
          trip: { trip_id: request.trip_id },
          request_id: request.request_id,
          trip_id: request.trip_id,
        });

        await this.agentActionLog?.updateStatus(sagaLogId, AGENT_ACTION_LOG_STATUS.COMMITTED);

        if (executionResult && typeof executionResult === 'object' && 'success' in executionResult && executionResult.success === false) {
          const msg = `Action returned unsuccessful result: ${JSON.stringify(executionResult)}`;
          await this.agentActionLog?.updateStatus(sagaLogId, AGENT_ACTION_LOG_STATUS.FAILED, msg);
          throw new Error(msg);
        }

        if (this.sideEffectRegistry && sideEffectConfigs.length > 0) {
          try {
            const applyResults = await this.sideEffectRegistry.applyMany(
              {
                request_id: request.request_id,
                trip_id: request.trip_id,
                action_id: action.action_id,
                action_name: actionName,
                action_type: action.action_type,
                target_type: action.target_type,
                target_ref: action.target_ref,
                action_input: action.action_input,
                state: {
                  trip: { trip_id: request.trip_id },
                  request_id: request.request_id,
                  trip_id: request.trip_id,
                },
              },
              sideEffectConfigs,
            );

            // Realized settlement (best-effort): capture applied hold tokens from side effect state_patch.
            const realized_holds: Array<Record<string, unknown>> = [];
            for (const r of applyResults ?? []) {
              const holds = (r as any)?.state_patch?.side_effects?.financial_holds;
              if (!Array.isArray(holds)) continue;
              for (const it of holds) {
                if (!it) continue;
                realized_holds.push({
                  hold_id: (it as any).hold_id,
                  amount: (it as any).amount ?? null,
                  currency: (it as any).currency ?? null,
                  expires_at: (it as any).expires_at ?? null,
                });
              }
            }
            if (realized_holds.length > 0) {
              sagaRealizedState.holds = realized_holds;
              await this.agentActionLog?.mergePayload(sagaLogId, {
                realized_state: { ...sagaRealizedState },
              });
            }

            // Resilient Execution (v0): post-commit settlement mismatch diagnosis for resources.
            // If auto_heal=true, also return a recomputed preview assessment to guide next action.
            if (request.auto_heal && decisionContractLocal) {
              const expectedDeltas = Array.isArray((decisionContractLocal as any)?.expected_state_delta?.deltas)
                ? (decisionContractLocal as any).expected_state_delta.deltas
                : [];
              const expectedHoldDelta = expectedDeltas.find((d: any) => d?.path === '$.budget.locked' && d?.op === 'inc');
              const expected_amount = typeof expectedHoldDelta?.value === 'number' ? expectedHoldDelta.value : null;
              const expected_currency = typeof expectedHoldDelta?.unit === 'string' ? expectedHoldDelta.unit : null;
              const av = Array.isArray((decisionContractLocal as any)?.allowed_variance)
                ? (decisionContractLocal as any).allowed_variance
                : [];
              const moneyRule = av.find((r: any) => r?.metric === 'budget.hold_amount' && r?.op === 'abs_delta_lte');
              const tol = typeof moneyRule?.threshold === 'number' ? moneyRule.threshold : 1;

              const actionHoldId = `hold_${String(action.action_id ?? '')}`;
              const realized = realized_holds.find((h) => String((h as any)?.hold_id ?? '') === actionHoldId) ?? null;
              const realized_amount = realized && typeof (realized as any).amount === 'number' ? (realized as any).amount : null;
              const abs_delta =
                expected_amount != null && realized_amount != null ? Math.abs(expected_amount - realized_amount) : null;
              const pass = abs_delta != null ? abs_delta <= tol : false;
              if (!pass) {
                healingDiagnoses.push({
                  action_id: String(action.action_id ?? ''),
                  saga_log_id: sagaLogId,
                  metric: 'budget.hold_amount',
                  expected_amount,
                  expected_currency,
                  realized_amount,
                  abs_delta,
                  tolerance: tol,
                  status: 'DRIFT',
                });
                try {
                  const preview = await this.preview({
                    request_id: `${request.request_id}::auto_heal`,
                    trip_id: request.trip_id,
                    actions: [action as any],
                    confirmation_mode: 'AUTO',
                  } as any);
                  if (Array.isArray((preview as any)?.action_previews)) {
                    healingRecomputedPreviews.push(...(preview as any).action_previews);
                  }
                } catch {
                  // best-effort only
                }
              } else if (healingDiagnoses.length > 0) {
                // no-op
              }

              // Physical/Environment healing (v0): detect HARD physics mismatch and trigger a replan via route_and_run.
              // We treat "expected feasible" -> "current not feasible" as a drift requiring replan.
              try {
                const expectedSnap = (decisionContractLocal as any)?.semantic_signature?.feasibility_snapshot ?? null;
                const capturedNow = this.contractCapturer
                  ? await this.contractCapturer.captureFeasibilitySnapshot({ tripId: request.trip_id, lookbackMinutes: 90, take: 80 })
                  : null;
                if (expectedSnap && capturedNow) {
                  const expectedFeasible = Boolean((expectedSnap as any).feasible);
                  const currentFeasible = Boolean(capturedNow.feasible);
                  if (expectedFeasible === true && currentFeasible === false) {
                    const violated = (capturedNow.facts || []).filter(
                      (f: any) => String(f?.severity ?? 'HARD').toUpperCase() === 'HARD' && Boolean(f?.is_violated) === true,
                    );
                    const top = violated[0];
                    const violatedRuleId = top?.rule_id != null ? String(top.rule_id) : null;
                    const diagnosisCode =
                      violatedRuleId === 'road_closed_v1' || String(violatedRuleId ?? '').startsWith('road_closed_')
                        ? 'road_closed_v1'
                        : violatedRuleId === 'solar_safety_v1' || String(violatedRuleId ?? '').startsWith('solar_safety_')
                          ? 'solar_safety_v1'
                        : violatedRuleId;
                    healingPhysicalDiagnoses.push({
                      action_id: String(action.action_id ?? ''),
                      saga_log_id: sagaLogId,
                      kind: 'PHYSICS_MISMATCH',
                      expected_feasible: true,
                      current_feasible: false,
                      violated_rule_id: violatedRuleId,
                      diagnosis_code: diagnosisCode,
                      evidence: top?.evidence ?? null,
                    });

                    const seg = top?.evidence?.segment_id ?? top?.evidence?.segmentId ?? null;
                    const segId = seg ? String(seg) : null;
                    const hint = seg ? `Avoid segment ${String(seg)}` : `Avoid rule ${String(top?.rule_id ?? '')}`;

                    const agentSvc = this.getAgentService();
                    if (agentSvc && segId && diagnosisCode === 'road_closed_v1') {
                      healingRouteAndRun = await agentSvc.routeAndRun({
                        request_id: `${request.request_id}::auto_heal::physics`,
                        user_id: 'system_auto_heal',
                        trip_id: request.trip_id,
                        message: `Auto-heal replan due to physical mismatch. ${hint}.`,
                        emergency_constraints: {
                          forbidden_segments: [segId],
                          forced_road_states: { [segId]: 'CLOSED' as const },
                          reason_code: 'HEALING_PHYSICAL_DRIFT',
                        },
                        options: {
                          use_claude_orchestration: true,
                          use_state_machine_orchestration: true,
                          execution_mode: 'ADVICE_ONLY',
                          max_seconds: 25,
                          allow_partial: true,
                        },
                        meta: { run_id: (request as any)?.idempotency_key ?? undefined },
                      } as any);
                    }

                    // Solar temporal healing: inject latest_end_time deadline and ask orchestrator to time-shift/swap.
                    if (agentSvc && diagnosisCode === 'solar_safety_v1') {
                      const ev = top?.evidence ?? {};
                      const key =
                        (ev as any)?.poi_id ??
                        (ev as any)?.poiId ??
                        (ev as any)?.segment_id ??
                        (ev as any)?.segmentId ??
                        segId ??
                        null;
                      const deadline =
                        (ev as any)?.safety_threshold_iso ??
                        (ev as any)?.safetyThresholdIso ??
                        (ev as any)?.latest_end_time_iso ??
                        (ev as any)?.latestEndTimeIso ??
                        null;
                      if (key && deadline) {
                      healingLegacySnapshots.push({
                        kind: 'legacy_snapshot_v1',
                        diagnosis_code: 'solar_safety_v1',
                        items: [
                          {
                            id: String(key),
                            original_start: (ev as any)?.actual_start_time_iso ?? (ev as any)?.actualStartTimeIso ?? null,
                            original_end: (ev as any)?.actual_end_time_iso ?? (ev as any)?.actualEndTimeIso ?? null,
                            sunset_time: (ev as any)?.sunset_time_iso ?? (ev as any)?.sunsetTimeIso ?? null,
                            safety_threshold: String(deadline),
                            unit: 'ISO_8601',
                          },
                        ],
                      });
                        healingRouteAndRun = await agentSvc.routeAndRun({
                          request_id: `${request.request_id}::auto_heal::solar`,
                          user_id: 'system_auto_heal',
                          trip_id: request.trip_id,
                          message:
                            `Auto-heal time-shift due to solar safety window. ` +
                            `Hard deadline: ${String(key)} <= ${String(deadline)}.`,
                          emergency_constraints: {
                            hard_deadlines: { [String(key)]: String(deadline) },
                            reason_code: 'HEALING_SOLAR_VIOLATION',
                          },
                          options: {
                            use_claude_orchestration: true,
                            use_state_machine_orchestration: true,
                            execution_mode: 'ADVICE_ONLY',
                            max_seconds: 25,
                            allow_partial: true,
                          },
                          meta: { run_id: (request as any)?.idempotency_key ?? undefined },
                        } as any);
                      }
                    }

                    // Contract evolution: commitment hash must move when emergency constraints are folded in.
                    if (decisionContractLocal && healingRouteAndRun) {
                      const emergency_constraints =
                        diagnosisCode === 'road_closed_v1' && segId
                          ? {
                              forbidden_segments: [segId],
                              forced_road_states: { [segId]: 'CLOSED' as const },
                              reason_code: 'HEALING_PHYSICAL_DRIFT',
                            }
                          : diagnosisCode === 'solar_safety_v1'
                            ? (() => {
                                const ev = top?.evidence ?? {};
                                const key =
                                  (ev as any)?.poi_id ??
                                  (ev as any)?.poiId ??
                                  (ev as any)?.segment_id ??
                                  (ev as any)?.segmentId ??
                                  segId ??
                                  null;
                                const deadline =
                                  (ev as any)?.safety_threshold_iso ??
                                  (ev as any)?.safetyThresholdIso ??
                                  (ev as any)?.latest_end_time_iso ??
                                  (ev as any)?.latestEndTimeIso ??
                                  null;
                                return key && deadline
                                  ? {
                                      hard_deadlines: { [String(key)]: String(deadline) },
                                      reason_code: 'HEALING_SOLAR_VIOLATION',
                                    }
                                  : {};
                              })()
                            : {};
                      const evolved_decision_contract = await this.buildDecisionContractV1({
                        tripId: request.trip_id,
                        actionName,
                        action,
                        sideEffectConfigs,
                        shadowDelta: pre.shadow_delta ?? undefined,
                        emergency_constraints,
                      });
                      const preview_constraint_hash = String(
                        (decisionContractLocal as any)?.semantic_signature?.constraint_hash ?? '',
                      );
                      const evolved_constraint_hash = String(
                        evolved_decision_contract?.semantic_signature?.constraint_hash ?? '',
                      );
                      actionContractEvolution = {
                        preview_constraint_hash,
                        evolved_constraint_hash,
                        evolved_decision_contract,
                      };
                      responseHealingContractEvolutions.push(actionContractEvolution);
                      const ru =
                        (healingRouteAndRun as any)?.resource_units ??
                        (healingRouteAndRun as any)?.meta?.resource_units ??
                        null;
                      const pathSeg =
                        (healingRouteAndRun as any)?.path_segments_after_heal ??
                        (healingRouteAndRun as any)?.segments_after_heal ??
                        null;
                      sagaRealizedState.route_evolution = {
                        emergency_segment_closed: segId,
                        emergency_deadlines: (emergency_constraints as any)?.hard_deadlines ?? null,
                        path_segments_resolved: pathSeg,
                        resource_units: ru,
                      };
                      await this.agentActionLog?.mergePayload(sagaLogId, {
                        realized_state: { ...sagaRealizedState },
                      });
                    }
                  }
                }
              } catch {
                // best-effort only
              }
            }
          } catch (se: any) {
            const seMsg = se?.message ?? String(se);
            await this.agentActionLog?.updateStatus(sagaLogId, AGENT_ACTION_LOG_STATUS.FAILED, seMsg);
            throw se;
          }
        }

        // Physical/Temporal healing should not depend on side effects being configured.
        // If auto_heal=true, detect "expected feasible" -> "current not feasible" and trigger a replan (space or time).
        if (request.auto_heal && decisionContractLocal && sagaLogId) {
          const already = healingPhysicalDiagnoses.some(
            (d: any) => String(d?.saga_log_id ?? '') === String(sagaLogId) && String(d?.kind ?? '') === 'PHYSICS_MISMATCH',
          );
          if (!already) {
            try {
              const expectedSnap = (decisionContractLocal as any)?.semantic_signature?.feasibility_snapshot ?? null;
              const capturedNow = this.contractCapturer
                ? await this.contractCapturer.captureFeasibilitySnapshot({ tripId: request.trip_id, lookbackMinutes: 90, take: 80 })
                : null;
              if (expectedSnap && capturedNow) {
                const expectedFeasible = Boolean((expectedSnap as any).feasible);
                const currentFeasible = Boolean((capturedNow as any).feasible);
                if (expectedFeasible === true && currentFeasible === false) {
                  const violated = ((capturedNow as any).facts || []).filter(
                    (f: any) =>
                      String(f?.severity ?? 'HARD').toUpperCase() === 'HARD' && Boolean(f?.is_violated) === true,
                  );
                  const top = violated[0];
                  const violatedRuleId = top?.rule_id != null ? String(top.rule_id) : null;
                  const diagnosisCode =
                    violatedRuleId === 'road_closed_v1' || String(violatedRuleId ?? '').startsWith('road_closed_')
                      ? 'road_closed_v1'
                      : violatedRuleId === 'solar_safety_v1' || String(violatedRuleId ?? '').startsWith('solar_safety_')
                        ? 'solar_safety_v1'
                      : violatedRuleId;
                  healingPhysicalDiagnoses.push({
                    action_id: String(action.action_id ?? ''),
                    saga_log_id: sagaLogId,
                    kind: 'PHYSICS_MISMATCH',
                    expected_feasible: true,
                    current_feasible: false,
                    violated_rule_id: violatedRuleId,
                    diagnosis_code: diagnosisCode,
                    evidence: top?.evidence ?? null,
                  });

                  const seg = top?.evidence?.segment_id ?? top?.evidence?.segmentId ?? null;
                  const segId = seg ? String(seg) : null;
                  const hint = seg ? `Avoid segment ${String(seg)}` : `Avoid rule ${String(top?.rule_id ?? '')}`;
                  const agentSvc = this.getAgentService();

                  if (agentSvc && segId && diagnosisCode === 'road_closed_v1') {
                    healingRouteAndRun = await agentSvc.routeAndRun({
                      request_id: `${request.request_id}::auto_heal::physics`,
                      user_id: 'system_auto_heal',
                      trip_id: request.trip_id,
                      message: `Auto-heal replan due to physical mismatch. ${hint}.`,
                      emergency_constraints: {
                        forbidden_segments: [segId],
                        forced_road_states: { [segId]: 'CLOSED' as const },
                        reason_code: 'HEALING_PHYSICAL_DRIFT',
                      },
                      options: {
                        use_claude_orchestration: true,
                        use_state_machine_orchestration: true,
                        execution_mode: 'ADVICE_ONLY',
                        max_seconds: 25,
                        allow_partial: true,
                      },
                      meta: { run_id: (request as any)?.idempotency_key ?? undefined },
                    } as any);
                  }

                  if (agentSvc && diagnosisCode === 'solar_safety_v1') {
                    const ev = top?.evidence ?? {};
                    const key =
                      (ev as any)?.poi_id ??
                      (ev as any)?.poiId ??
                      (ev as any)?.segment_id ??
                      (ev as any)?.segmentId ??
                      segId ??
                      null;
                    const deadline =
                      (ev as any)?.safety_threshold_iso ??
                      (ev as any)?.safetyThresholdIso ??
                      (ev as any)?.latest_end_time_iso ??
                      (ev as any)?.latestEndTimeIso ??
                      null;
                    if (key && deadline) {
                      healingLegacySnapshots.push({
                        kind: 'legacy_snapshot_v1',
                        diagnosis_code: 'solar_safety_v1',
                        items: [
                          {
                            id: String(key),
                            original_start: (ev as any)?.actual_start_time_iso ?? (ev as any)?.actualStartTimeIso ?? null,
                            original_end: (ev as any)?.actual_end_time_iso ?? (ev as any)?.actualEndTimeIso ?? null,
                            sunset_time: (ev as any)?.sunset_time_iso ?? (ev as any)?.sunsetTimeIso ?? null,
                            safety_threshold: String(deadline),
                            unit: 'ISO_8601',
                          },
                        ],
                      });
                      healingRouteAndRun = await agentSvc.routeAndRun({
                        request_id: `${request.request_id}::auto_heal::solar`,
                        user_id: 'system_auto_heal',
                        trip_id: request.trip_id,
                        message:
                          `Auto-heal time-shift due to solar safety window. ` +
                          `Hard deadline: ${String(key)} <= ${String(deadline)}.`,
                        emergency_constraints: {
                          hard_deadlines: { [String(key)]: String(deadline) },
                          reason_code: 'HEALING_SOLAR_VIOLATION',
                        },
                        options: {
                          use_claude_orchestration: true,
                          use_state_machine_orchestration: true,
                          execution_mode: 'ADVICE_ONLY',
                          max_seconds: 25,
                          allow_partial: true,
                        },
                        meta: { run_id: (request as any)?.idempotency_key ?? undefined },
                      } as any);
                    }
                  }

                  if (decisionContractLocal && healingRouteAndRun) {
                    const emergency_constraints =
                      diagnosisCode === 'road_closed_v1' && segId
                        ? {
                            forbidden_segments: [segId],
                            forced_road_states: { [segId]: 'CLOSED' as const },
                            reason_code: 'HEALING_PHYSICAL_DRIFT',
                          }
                        : diagnosisCode === 'solar_safety_v1'
                          ? (() => {
                              const ev = top?.evidence ?? {};
                              const key =
                                (ev as any)?.poi_id ??
                                (ev as any)?.poiId ??
                                (ev as any)?.segment_id ??
                                (ev as any)?.segmentId ??
                                segId ??
                                null;
                              const deadline =
                                (ev as any)?.safety_threshold_iso ??
                                (ev as any)?.safetyThresholdIso ??
                                (ev as any)?.latest_end_time_iso ??
                                (ev as any)?.latestEndTimeIso ??
                                null;
                              return key && deadline
                                ? {
                                    hard_deadlines: { [String(key)]: String(deadline) },
                                    reason_code: 'HEALING_SOLAR_VIOLATION',
                                  }
                                : {};
                            })()
                          : {};
                    const evolved_decision_contract = await this.buildDecisionContractV1({
                      tripId: request.trip_id,
                      actionName,
                      action,
                      sideEffectConfigs,
                      shadowDelta: pre.shadow_delta ?? undefined,
                      emergency_constraints,
                    });
                    const preview_constraint_hash = String(
                      (decisionContractLocal as any)?.semantic_signature?.constraint_hash ?? '',
                    );
                    const evolved_constraint_hash = String(
                      evolved_decision_contract?.semantic_signature?.constraint_hash ?? '',
                    );
                    actionContractEvolution = {
                      preview_constraint_hash,
                      evolved_constraint_hash,
                      evolved_decision_contract,
                    };
                    responseHealingContractEvolutions.push(actionContractEvolution);
                    const ru =
                      (healingRouteAndRun as any)?.resource_units ??
                      (healingRouteAndRun as any)?.meta?.resource_units ??
                      null;
                    const pathSeg =
                      (healingRouteAndRun as any)?.path_segments_after_heal ??
                      (healingRouteAndRun as any)?.segments_after_heal ??
                      null;
                    sagaRealizedState.route_evolution = {
                      emergency_segment_closed: segId,
                      emergency_deadlines: (emergency_constraints as any)?.hard_deadlines ?? null,
                      path_segments_resolved: pathSeg,
                      resource_units: ru,
                    };
                    await this.agentActionLog?.mergePayload(sagaLogId, {
                      realized_state: { ...sagaRealizedState },
                    });
                  }
                }
              }
            } catch {
              // best-effort only
            }
          }
        }

        await this.agentActionLog?.updateStatus(sagaLogId, AGENT_ACTION_LOG_STATUS.SIDE_EFFECT_DONE);

        acceptedActions.push(action);

        // Persist healing audit marker (best-effort) for admin QA.
        if (request.auto_heal && sagaLogId) {
          const triggered = healingDiagnoses.length > 0 || healingPhysicalDiagnoses.length > 0;
          if (triggered) {
            await this.agentActionLog?.mergePayload(sagaLogId, {
              healing_triggered: true,
              healing: {
                diagnoses: healingDiagnoses,
                physical_diagnoses: healingPhysicalDiagnoses,
                ...(healingRouteAndRun ? { route_and_run: healingRouteAndRun } : {}),
                ...(actionContractEvolution
                  ? {
                      contract_evolution: {
                        preview_constraint_hash: actionContractEvolution.preview_constraint_hash,
                        evolved_constraint_hash: actionContractEvolution.evolved_constraint_hash,
                      },
                      evolved_decision_contract: actionContractEvolution.evolved_decision_contract,
                    }
                  : {}),
              },
            });
          }
        }
      } catch (error: any) {
        const errMsg = error?.message ?? String(error);
        await this.agentActionLog?.updateStatus(sagaLogId, AGENT_ACTION_LOG_STATUS.FAILED, errMsg);
        this.logger.warn(
          `[ActionExecution] action execution failed: action_name=${actionName}, action_id=${action.action_id}, error=${errMsg}`,
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
      ...(request.auto_heal
        ? {
            healing: {
              triggered: healingDiagnoses.length > 0 || healingPhysicalDiagnoses.length > 0,
              diagnoses: healingDiagnoses,
              ...(healingPhysicalDiagnoses.length ? { physical_diagnoses: healingPhysicalDiagnoses } : {}),
              ...(healingRecomputedPreviews.length ? { recomputed_previews: healingRecomputedPreviews } : {}),
              ...(healingRouteAndRun ? { recomputed_route_and_run: healingRouteAndRun } : {}),
              ...(healingRouteAndRun && (healingRouteAndRun as any)?.itinerary
                ? { recomputed_itinerary: (healingRouteAndRun as any).itinerary }
                : {}),
              ...(healingRouteAndRun && Array.isArray((healingRouteAndRun as any)?.action_previews)
                ? { recomputed_previews: (healingRouteAndRun as any).action_previews }
                : {}),
              ...(healingLegacySnapshots.length ? { legacy_snapshot: healingLegacySnapshots.at(-1) } : {}),
              ...(responseHealingContractEvolutions.length
                ? {
                    contract_evolutions: responseHealingContractEvolutions.map((e) => ({
                      preview_constraint_hash: e.preview_constraint_hash,
                      evolved_constraint_hash: e.evolved_constraint_hash,
                    })),
                    evolved_decision_contract: responseHealingContractEvolutions.at(-1)!.evolved_decision_contract,
                    preview_constraint_hash:
                      responseHealingContractEvolutions[0]!.preview_constraint_hash,
                  }
                : {}),
            },
          }
        : {}),
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

  /**
   * Registry defaults + optional runtime overrides (Decision Center / admin / future DB).
   */
  private buildSideEffectConfigs(
    actionName: string,
    actionDef: Action | undefined,
  ): Array<{ handlerId: string; params?: Record<string, any> }> {
    const raw = (actionDef?.side_effect_configs ?? [])
      .map((c) => ({
        handlerId: String(c?.handlerId ?? ''),
        params: c?.params,
      }))
      .filter((c) => Boolean(c.handlerId));
    if (!this.sideEffectParamResolver || raw.length === 0) {
      return raw;
    }
    return this.sideEffectParamResolver.resolve(actionName, raw);
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
    extra?: Partial<ActionExecutionItemDto>,
  ): ActionExecutionItemDto {
    return {
      ...action,
      rejected_reason_code: reason,
      rejected_message: ACTION_REJECT_REASON_MESSAGES[reason],
      ...(extra ? extra : {}),
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
