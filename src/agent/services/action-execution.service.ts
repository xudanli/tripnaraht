import { Injectable, Logger, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import {
  ActionCommitRequestDto,
  ActionExecutionResponseDto,
  ActionExecutionItemDto,
  ActionPreviewRequestDto,
  ActionRollbackRequestDto,
  ContextSignatureV12Dto,
  type SuggestedHealingOptionItemDto,
} from '../dto/action-execution.dto';
import { RequestDeduplicationService } from './request-deduplication.service';
import {
  ACTION_REJECT_REASON_CODES,
  ACTION_REJECT_REASON_MESSAGES,
  ActionRejectReasonCode,
  HEALING_ONE_CLICK_ACTION_ID,
  TRAVEL_ONTOLOGY_MERGE_POLICY,
} from '../constants/action-execution.constants';
import type { Action } from '../interfaces/action.interface';
import { ActionRegistryService } from './action-registry.service';
import { AgentEventType, EventTelemetryService } from './event-telemetry.service';
import { SideEffectRegistryService } from './side-effect-registry.service';
import { SideEffectApplyFailedError } from './side-effect-registry.service';
import { FinancialHoldSideEffect } from '../actions/side-effects/financial-hold.side-effect';
import { createResourceLockSideEffect } from '../actions/side-effects/resource-lock.side-effect';
import { SideEffectParamResolverService } from './side-effect-param-resolver.service';
import { AgentActionLogService } from './agent-action-log.service';
import { AGENT_ACTION_LOG_STATUS } from '../constants/agent-action-log.constants';
import { DecisionContractV1, sha256Signature, type PhysicsFactV1 } from '../contracts/decision-contract.types';
import {
  ACTIONS_ROLLBACK_PRODUCT_STATUS,
  ACTIONS_ROLLBACK_STUB_MESSAGE,
} from '../contracts/rollback-corridor.product.constants';
import { DecisionContractCapturerService } from './decision-contract-capturer.service';
import type { AgentService } from './agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { physicalGateFingerprint } from '../../domain/ontology/validator/physical-validator.fingerprint';
import {
  PHYSICAL_VALIDATOR_VERSION,
  ViolationCode,
  violationStrategyForCode,
  type ActionSeverity,
} from '../../domain/ontology/validator/physical-validator.constants';
import { PhysicalValidatorService } from '../../domain/ontology/validator/physical-validator.service';
import { SelfHealingService } from '../../domain/ontology/healer/self-healing.service';
import {
  toPhysicalValidationSignable,
  type PhysicalEvaluationResult,
  type PhysicalViolationItem,
} from '../../domain/ontology/validator/physical-validator.types';
import type { DecisionState } from '../../decision/kernel/decision-state.types';
import { budgetCapFromUserIntent, scaleTravelOntologyNounsToBudgetCap } from '../../decision/kernel/travel-ontology-constraints';
import { ontologyContextToNouns } from '../../decision/kernel/travel-ontology.mapper';
import {
  buildTripPhysicalValidationSnapshot,
  mergeTripPhysicalValidationSnapshot,
} from '../../domain/ontology/bridge/physical-violation-snapshot.util';
import { ContingencyOrchestratorService } from '../../decision/contingency/contingency-orchestrator.service';

class MissingRequiredEvidenceError extends Error {
  constructor(
    public readonly context: {
      required_action_type: 'FINANCIAL_HOLD';
      required_evidence_type: 'EvidenceCard';
      side_effect_kind: 'FINANCIAL_HOLD';
    },
  ) {
    super(ACTION_REJECT_REASON_CODES.MISSING_REQUIRED_EVIDENCE);
    this.name = 'MissingRequiredEvidenceError';
  }
}

@Injectable()
export class ActionExecutionService {
  private static readonly EVIDENCE_REQUIREMENT_ACTION = '__admin__.evidence_requirement';
  private readonly contextSignatureTtlMs = 10 * 60 * 1000;
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
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly physicalValidator?: PhysicalValidatorService,
    @Optional() private readonly selfHealing?: SelfHealingService,
    @Optional() private readonly contingencyOrchestrator?: ContingencyOrchestratorService,
  ) {
    // v1 bootstrap: register built-in side effects when registry is available.
    this.sideEffectRegistry?.register(FinancialHoldSideEffect);
    this.sideEffectRegistry?.register(createResourceLockSideEffect(this.prisma));
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

    const extracted_environment_hash = String(
      (captured?.facts ?? [])
        .map((f) => (f as any)?.evidence?.environment_hash)
        .find((v) => typeof v === 'string' && v.trim()) ?? '',
    ).trim() || null;

    const env_hash = sha256Signature({
      // Use preview shadow delta as env surrogate for resource state snapshot.
      shadow_delta: params.shadowDelta ?? null,
      wallet: action_input && typeof (action_input as any).wallet === 'object' ? (action_input as any).wallet : null,
      // Spec: include environmentHash to prevent Preview→Commit drift due to weather/solar updates.
      environment_hash: extracted_environment_hash,
    });

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
            let gateInput: Record<string, unknown> =
              a.action_input && typeof a.action_input === 'object' ? (a.action_input as Record<string, unknown>) : {};
            let physicalResult = await this.runPhysicalGate(request.trip_id, gateInput);
            let healingPreviewMeta: { is_auto_healed: true; healing_summary: string } | undefined;

            let routeSeverity = this.determineActionSeverity(physicalResult.violations);
            if (routeSeverity === 'SILENT_HEAL' && physicalResult.violations.length > 0) {
              const healed = await this.performSilentHealing(request.trip_id, gateInput, physicalResult);
              if (healed) {
                physicalResult = healed.physical;
                gateInput = healed.actionInput;
                healingPreviewMeta = { is_auto_healed: true, healing_summary: healed.healing_summary };
                routeSeverity = this.determineActionSeverity(physicalResult.violations);
                await this.recordSilentHealContingency(request.trip_id, healed.healing_summary);
              } else {
                routeSeverity = 'INTERRUPT';
              }
            }

            const effectiveActionInput = healingPreviewMeta
              ? gateInput
              : a.action_input !== undefined && a.action_input !== null
                ? a.action_input
                : null;
            const registryInput: Record<string, unknown> =
              effectiveActionInput != null && typeof effectiveActionInput === 'object'
                ? (effectiveActionInput as Record<string, unknown>)
                : {};
            const actionForPreview = { ...a, action_input: effectiveActionInput } as ActionCommitRequestDto['actions'][number];
            const physical = physicalResult;
            const gateFp = this.computePhysicalGateFingerprint(physical);
            const physicalSignable = toPhysicalValidationSignable(physical);
            const physicalOut = { ...physicalSignable, evaluated_at: physical.evaluated_at };
            const effectiveVerb = this.normalizeVerbForMapping(a.action_type);
            const actionName = a.action_name || this.mapActionName(effectiveVerb, a.target_type);

            if (routeSeverity === 'INTERRUPT') {
              const interruptExtras = this.buildSuggestiveHealingEnvelope(
                physical.violations,
                gateInput,
              );
              const resourceSnapshot = await this.buildResourceSnapshotForSignature(actionForPreview);
              const findings = this.physicalPreconditionsFromViolations(physical);
              const assessmentBlocked = { status: 'blocked' as const, findings, shadow_delta: null };
              const previewPayload = {
                action_id: a.action_id,
                action_name: actionName ?? null,
                action_type: a.action_type,
                target_type: a.target_type,
                target_ref: a.target_ref,
                action_input: effectiveActionInput,
                physical_validation: physicalSignable,
                assessment: assessmentBlocked,
              };
              const context_signature = sha256Signature(previewPayload);
              const context_signature_v2 = this.buildContextSignatureV2({
                action: actionForPreview,
                actionName: actionName ?? null,
                assessment: assessmentBlocked,
                side_effects: [],
                resource_snapshot: resourceSnapshot,
                physicalGateFingerprint: gateFp,
              });
              return {
                action_id: a.action_id,
                status: 'blocked' as const,
                preconditions: findings,
                physical_validation: physicalOut,
                ...(resourceSnapshot ? { resource_snapshot: resourceSnapshot } : {}),
                context_signature,
                context_signature_v2,
                ...(healingPreviewMeta ?? {}),
                ...interruptExtras,
              };
            }

            if (!actionName || !registry.has(actionName)) {
              const resourceSnapshot = await this.buildResourceSnapshotForSignature(actionForPreview);
              const physicalFindings = this.physicalPreconditionsFromViolations(physical);
              const unknownFinding = {
                code: 'UNKNOWN',
                severity: 'BLOCK' as const,
                message: actionName ? `Action not registered: ${actionName}` : 'Missing action_name mapping',
              };
              const previewPayload = {
                action_id: a.action_id,
                action_name: actionName ?? null,
                action_type: a.action_type,
                target_type: a.target_type,
                target_ref: a.target_ref,
                action_input: effectiveActionInput,
                physical_validation: physicalSignable,
                assessment: {
                  status: 'blocked',
                  findings: [...physicalFindings, unknownFinding],
                  shadow_delta: null,
                },
              };
              const context_signature = sha256Signature(previewPayload);
              const context_signature_v2 = this.buildContextSignatureV2({
                action: actionForPreview,
                actionName: actionName ?? null,
                assessment: {
                  status: 'blocked',
                  findings: [...physicalFindings, unknownFinding],
                  shadow_delta: null,
                },
                side_effects: [],
                resource_snapshot: resourceSnapshot,
                physicalGateFingerprint: gateFp,
              });
              return {
                action_id: a.action_id,
                status: 'blocked' as const,
                preconditions: previewPayload.assessment.findings,
                physical_validation: physicalOut,
                ...(resourceSnapshot ? { resource_snapshot: resourceSnapshot } : {}),
                context_signature,
                context_signature_v2,
                ...(healingPreviewMeta ?? {}),
              };
            }
            const assessment = registry.checkPreconditions(
              actionName,
              {
                trip: { trip_id: request.trip_id },
                request_id: request.request_id,
                trip_id: request.trip_id,
                ...(registryInput && typeof (registryInput as any).wallet === 'object'
                  ? { wallet: (registryInput as any).wallet }
                  : {}),
              },
              registryInput,
            );
            const physicalFindings = this.physicalPreconditionsFromViolations(physical);
            const mergedFindings = [...physicalFindings, ...(assessment.findings ?? [])];
            const mergedAssessment = {
              status: assessment.status,
              findings: mergedFindings,
              shadow_delta: assessment.shadow_delta ?? null,
            };
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
                    action_input: registryInput,
                    state: {
                      trip: { trip_id: request.trip_id },
                      request_id: request.request_id,
                      trip_id: request.trip_id,
                      ...(registryInput && typeof (registryInput as any).wallet === 'object'
                        ? { wallet: (registryInput as any).wallet }
                        : {}),
                    },
                  },
                  sideEffectConfigs,
                )
              : [];
            const resourceSnapshot = await this.buildResourceSnapshotForSignature(actionForPreview);
            const previewPayload = {
              action_id: a.action_id,
              action_name: actionName,
              action_type: a.action_type,
              target_type: a.target_type,
              target_ref: a.target_ref,
              action_input: effectiveActionInput,
              physical_validation: physicalSignable,
              ...(side_effects.length ? { side_effects } : {}),
              assessment: {
                status: mergedAssessment.status,
                findings: mergedAssessment.findings,
                shadow_delta: mergedAssessment.shadow_delta,
              },
            };
            const context_signature = sha256Signature(previewPayload);
            const context_signature_v2 = this.buildContextSignatureV2({
              action: actionForPreview,
              actionName,
              assessment: mergedAssessment,
              side_effects,
              resource_snapshot: resourceSnapshot,
              physicalGateFingerprint: gateFp,
            });
            return {
              action_id: a.action_id,
              status: mergedAssessment.status,
              preconditions: mergedAssessment.findings,
              physical_validation: physicalOut,
              ...(mergedAssessment.shadow_delta ? { shadow_delta: mergedAssessment.shadow_delta } : {}),
              ...(side_effects.length ? { side_effects } : {}),
              ...(resourceSnapshot ? { resource_snapshot: resourceSnapshot } : {}),
              context_signature,
              context_signature_v2,
              ...(healingPreviewMeta ?? {}),
            };
          }))
        : undefined;
    const signatureById = new Map(
      (action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), String((p as any).context_signature ?? '')]),
    );
    const signatureV2ById = new Map(
      (action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).context_signature_v2 ?? undefined]),
    );
    const shadowDeltaById = new Map((action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).shadow_delta ?? undefined]));
    const sideEffectsById = new Map((action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).side_effects ?? undefined]));
    const resourceSnapshotById = new Map(
      (action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).resource_snapshot ?? undefined]),
    );
    const physicalSnapById = new Map(
      (action_previews ?? []).map((p) => [String((p as any).action_id ?? ''), (p as any).physical_validation]),
    );
    const accepted_actions = actionsWithPolicy.map((a) => {
      const pid = String(a.action_id ?? '');
      const physSnap = physicalSnapById.get(pid);
      const preview_snapshot = {
        ...(shadowDeltaById.get(pid) ? { shadow_delta: shadowDeltaById.get(pid) } : {}),
        ...(sideEffectsById.get(pid) ? { side_effects: sideEffectsById.get(pid) } : {}),
        ...(resourceSnapshotById.get(pid) ? { resource_snapshot: resourceSnapshotById.get(pid) } : {}),
        ...(physSnap ? { physical_validation: physSnap } : {}),
      };
      const hasSnap = Object.keys(preview_snapshot).length > 0;
      return {
        ...a,
        ...(signatureById.get(pid) ? { context_signature: signatureById.get(pid) } : {}),
        ...(signatureV2ById.get(pid) ? { context_signature_v2: signatureV2ById.get(pid) } : {}),
        ...(physSnap
          ? {
              physical_validator_version: physSnap.validator_version,
              physical_rule_bundle_id: physSnap.rule_bundle_id,
            }
          : {}),
        ...(hasSnap ? { preview_snapshot } : {}),
      };
    });
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
    const requiredEvidenceActionTypes = await this.loadRequiredEvidenceActionTypes();
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

      const physicalAtCommit = await this.runPhysicalGate(
        request.trip_id,
        action.action_input as Record<string, unknown>,
        'action_commit',
      );
      const physicalSnapCommit = toPhysicalValidationSignable(physicalAtCommit);
      const echoedPv =
        String((action as any).physical_validator_version ?? '').trim() ||
        String((action as any).preview_snapshot?.physical_validation?.validator_version ?? '').trim();
      if (this.requiresPhysicalVersionEcho(action.action_input, physicalAtCommit)) {
        if (echoedPv !== PhysicalValidatorService.VALIDATOR_VERSION) {
          const expectedVersion = PhysicalValidatorService.VALIDATOR_VERSION;
          const receivedVersion = echoedPv || null;
          this.logger.error(
            `[ActionExecution] PHYSICAL_VALIDATOR_VERSION_MISMATCH action_id=${action.action_id} ` +
              `(current: ${PHYSICAL_VALIDATOR_VERSION}, requested: ${String((action as any).physical_validator_version ?? '') || '(unset)'}) ` +
              `expected_version=${expectedVersion} received_version=${receivedVersion ?? '(missing)'}`,
          );
          this.eventTelemetry?.recordEvent({
            type: AgentEventType.SYSTEM2_STEP,
            request_id: request.request_id,
            data: {
              action_api: 'commit',
              system_action: 'PHYSICAL_VALIDATOR_VERSION_MISMATCH',
              action_id: action.action_id,
              expected_version: expectedVersion,
              received_version: receivedVersion,
              rule_bundle_id: PhysicalValidatorService.RULE_BUNDLE_ID,
            },
          });
          blockedActions.push(
            this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.PHYSICAL_VALIDATOR_VERSION_MISMATCH, {
              rejected_message:
                `${ACTION_REJECT_REASON_MESSAGES.PHYSICAL_VALIDATOR_VERSION_MISMATCH} ` +
                `(expected ${expectedVersion}, got ${receivedVersion ?? 'missing'})`,
              physical_validator_audit: {
                expected_version: expectedVersion,
                received_version: receivedVersion,
                rule_bundle_id: PhysicalValidatorService.RULE_BUNDLE_ID,
              },
            } as any),
          );
          rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.PHYSICAL_VALIDATOR_VERSION_MISMATCH);
          continue;
        }
      }
      if (physicalAtCommit.blocking) {
        const healingExtras = this.buildSuggestiveHealingEnvelope(
          physicalAtCommit.violations,
          action.action_input as Record<string, unknown>,
        );
        blockedActions.push(
          this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.PHYSICAL_VALIDATOR_BLOCKED, {
            rejected_message: ACTION_REJECT_REASON_MESSAGES.PHYSICAL_VALIDATOR_BLOCKED,
            physical_violations: physicalAtCommit.violations,
            ...healingExtras,
          } as any),
        );
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.PHYSICAL_VALIDATOR_BLOCKED);
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
      const physicalFindingsCommit = this.physicalPreconditionsFromViolations(physicalAtCommit);
      const mergedAssessmentCommit = {
        status: pre.status,
        findings: [...physicalFindingsCommit, ...(pre.findings ?? [])],
        shadow_delta: pre.shadow_delta ?? null,
      };
      const actionDef = this.actionRegistry.get(actionName);
      const sideEffectConfigs = this.buildSideEffectConfigs(actionName, actionDef);
      if (this.requiresStrictIdempotency(action, sideEffectConfigs) && !String(request.idempotency_key ?? '').trim()) {
        blockedActions.push(this.withRejectedReason(action, ACTION_REJECT_REASON_CODES.MISSING_IDEMPOTENCY_KEY));
        rejectedReasonCodes.add(ACTION_REJECT_REASON_CODES.MISSING_IDEMPOTENCY_KEY);
        continue;
      }
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
      const resourceSnapshot = await this.buildResourceSnapshotForSignature(action);
      const recomputePayload = {
        action_id: action.action_id,
        action_name: actionName,
        action_type: action.action_type,
        target_type: action.target_type,
        target_ref: action.target_ref,
        action_input: action.action_input ?? null,
        physical_validation: physicalSnapCommit,
        ...(side_effects_recomputed.length ? { side_effects: side_effects_recomputed } : {}),
        assessment: {
          status: mergedAssessmentCommit.status,
          findings: mergedAssessmentCommit.findings,
          shadow_delta: mergedAssessmentCommit.shadow_delta,
        },
      };
      const recomputedSig = sha256Signature(recomputePayload);
      const recomputedSigV2 = this.buildContextSignatureV2({
        action,
        actionName,
        assessment: mergedAssessmentCommit,
        side_effects: side_effects_recomputed,
        resource_snapshot: resourceSnapshot,
        physicalGateFingerprint: this.computePhysicalGateFingerprint(physicalAtCommit),
      });
      const providedSigV2 = (action as any)?.context_signature_v2 as ContextSignatureV12Dto | undefined;
      const staleDimensions = this.findStaleDimensions(providedSigV2, recomputedSigV2);
      const v2Mismatch = staleDimensions.length > 0;
      const v1Mismatch = String((action as any).context_signature) !== recomputedSig;
      if (v1Mismatch || v2Mismatch) {
        const originalShadowDelta = (action as any)?.preview_snapshot?.shadow_delta;
        const originalSideEffects = (action as any)?.preview_snapshot?.side_effects;
        const origAfter = originalShadowDelta?.resources?.budget?.after;
        const origCur = originalShadowDelta?.resources?.budget?.currency;
        const budgetAfter = (pre as any)?.shadow_delta?.resources?.budget?.after;
        const currency = (pre as any)?.shadow_delta?.resources?.budget?.currency;
        const resourceDrift = staleDimensions.includes('resourceHash');
        const reasonCode = resourceDrift
          ? ACTION_REJECT_REASON_CODES.RESOURCE_STALE_RECOMPUTE
          : ACTION_REJECT_REASON_CODES.ACTION_PREVIEW_SIGNATURE_MISMATCH;
        const baseMsg = ACTION_REJECT_REASON_MESSAGES[reasonCode];
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
          this.withRejectedReason(action, reasonCode, {
            rejected_message: enrichedMsg,
            stale_shadow_context: {
              provided_signature: String((action as any).context_signature ?? ''),
              recomputed_signature: recomputedSig,
              ...(providedSigV2 ? { provided_signature_v2: providedSigV2 } : {}),
              recomputed_signature_v2: recomputedSigV2,
              ...(staleDimensions.length ? { stale_dimensions: staleDimensions } : {}),
              ...((action as any)?.preview_snapshot?.resource_snapshot
                ? { original_resource_snapshot: (action as any).preview_snapshot.resource_snapshot }
                : {}),
              ...(resourceSnapshot ? { recomputed_resource_snapshot: resourceSnapshot } : {}),
              ...(originalShadowDelta ? { original_shadow_delta: originalShadowDelta } : {}),
              ...(originalSideEffects ? { original_side_effects: originalSideEffects } : {}),
              physical_violations: physicalAtCommit.violations,
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
            provided_signature_v2: providedSigV2 ?? null,
            recomputed_signature_v2: recomputedSigV2,
            stale_dimensions: staleDimensions,
            original_shadow_delta: originalShadowDelta ?? null,
            recomputed_shadow_delta: pre.shadow_delta ?? null,
            original_side_effects: originalSideEffects ?? null,
            recomputed_side_effects: side_effects_recomputed ?? null,
          },
        });
        rejectedReasonCodes.add(reasonCode);
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
            if (requiredEvidenceActionTypes.has('FINANCIAL_HOLD') && this.hasFinancialSideEffectWithoutEvidence(applyResults)) {
              const evidenceError = new MissingRequiredEvidenceError({
                required_action_type: 'FINANCIAL_HOLD',
                required_evidence_type: 'EvidenceCard',
                side_effect_kind: 'FINANCIAL_HOLD',
              });
              await this.agentActionLog?.mergePayload(sagaLogId, {
                evidence_requirement_context: evidenceError.context,
              });
              await this.agentActionLog?.updateStatus(
                sagaLogId,
                AGENT_ACTION_LOG_STATUS.FAILED,
                evidenceError.message,
              );
              throw evidenceError;
            }

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
        if (sagaLogId && error instanceof SideEffectApplyFailedError) {
          sagaRealizedState.side_effects_ledger = error.side_effects_ledger;
          const maxRetryCount = (error.side_effects_ledger ?? []).reduce((acc, entry) => {
            const retryCount = Number((entry as any)?.retry_count ?? 0);
            return Number.isFinite(retryCount) ? Math.max(acc, Math.floor(retryCount)) : acc;
          }, 0);
          sagaRealizedState.max_retry_count = maxRetryCount;
          await this.agentActionLog?.mergePayload(sagaLogId, {
            realized_state: { ...sagaRealizedState },
          });
        }
        await this.agentActionLog?.updateStatus(sagaLogId, AGENT_ACTION_LOG_STATUS.FAILED, errMsg);
        this.logger.warn(
          `[ActionExecution] action execution failed: action_name=${actionName}, action_id=${action.action_id}, error=${errMsg}`,
        );
        const reasonCode =
          error instanceof MissingRequiredEvidenceError ||
          errMsg === ACTION_REJECT_REASON_CODES.MISSING_REQUIRED_EVIDENCE
            ? ACTION_REJECT_REASON_CODES.MISSING_REQUIRED_EVIDENCE
            : ACTION_REJECT_REASON_CODES.ACTION_EXECUTION_FAILED;
        blockedActions.push(
          this.withRejectedReason(action, reasonCode, {
            ...(error instanceof MissingRequiredEvidenceError
              ? { evidence_requirement_context: error.context }
              : {}),
          }),
        );
        rejectedReasonCodes.add(reasonCode);
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
      `[ActionExecution] rollback request_id=${request.request_id}, trip_id=${request.trip_id}, action_ids=${request.action_ids.length} product_status=${ACTIONS_ROLLBACK_PRODUCT_STATUS}`,
    );
    // RB-1: product stub — does not reverse commits or side effects.
    const response: ActionExecutionResponseDto = {
      status: 'OK',
      message: ACTIONS_ROLLBACK_STUB_MESSAGE,
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

  getActionRegistryCatalog(): {
    total: number;
    actions: Array<{
      name: string;
      description: string;
      category: string;
      side_effect_handlers: string[];
      preconditions: string[];
    }>;
  } {
    const actions = (this.actionRegistry?.list?.() ?? []).map((a) => ({
      name: String(a.name),
      description: String(a.description ?? ''),
      category: String(a.name ?? '').split('.')[0] || 'unknown',
      side_effect_handlers: (a.side_effect_configs ?? [])
        .map((s) => String(s?.handlerId ?? ''))
        .filter(Boolean),
      preconditions: (a.metadata?.preconditions ?? []).map((p) => String(p)),
    }));
    return {
      total: actions.length,
      actions,
    };
  }

  simulateActionNameMapping(input: {
    action_type: string;
    target_type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
    action_name?: string;
  }): {
    action_type: string;
    normalized_action_type: string;
    target_type: string;
    mapped_action_name: string | null;
    exists_in_registry: boolean;
    source: 'explicit' | 'mapping';
  } {
    const normalized = this.normalizeVerbForMapping(input.action_type);
    const mapped = input.action_name?.trim() || this.mapActionName(normalized, input.target_type);
    return {
      action_type: String(input.action_type ?? ''),
      normalized_action_type: normalized,
      target_type: String(input.target_type ?? ''),
      mapped_action_name: mapped,
      exists_in_registry: mapped ? Boolean(this.actionRegistry?.get(mapped)) : false,
      source: input.action_name?.trim() ? 'explicit' : 'mapping',
    };
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

  private requiresStrictIdempotency(
    action: ActionCommitRequestDto['actions'][number],
    sideEffectConfigs: Array<{ handlerId: string; params?: Record<string, any> }>,
  ): boolean {
    const actionType = String(action.action_type ?? '').toUpperCase();
    if (actionType === 'BOOK' || actionType === 'PAY') {
      return true;
    }
    return sideEffectConfigs.some((cfg) => {
      const handlerId = String(cfg?.handlerId ?? '').toLowerCase();
      return handlerId.includes('financial') || handlerId.includes('booking');
    });
  }

  private hasFinancialSideEffectWithoutEvidence(results: Array<{ kind?: string; evidenceBundle?: unknown }>): boolean {
    return (results ?? []).some((r) => {
      const kind = String((r as any)?.kind ?? '').toUpperCase();
      if (kind !== 'FINANCIAL_HOLD') return false;
      return !(r as any)?.evidenceBundle;
    });
  }

  private async loadRequiredEvidenceActionTypes(): Promise<Set<string>> {
    if (!this.prisma?.isDbConnected?.()) {
      return new Set();
    }
    const decisionRuleConfig = (this.prisma as any)?.decisionRuleConfig;
    if (!decisionRuleConfig || typeof decisionRuleConfig.findMany !== 'function') {
      return new Set();
    }
    try {
      const rows = await decisionRuleConfig.findMany({
        where: {
          actionName: ActionExecutionService.EVIDENCE_REQUIREMENT_ACTION,
          isActive: true,
        },
      });
      const required = new Set<string>();
      for (const row of rows) {
        const p = row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? (row.params as any) : {};
        const at = String(p.actionType ?? '').trim().toUpperCase();
        const ev = String(p.evidenceType ?? '').trim();
        const req = Boolean(p.required);
        if (!at || !req || ev !== 'EvidenceCard') continue;
        required.add(at);
      }
      return required;
    } catch (e: any) {
      this.logger.warn(`load evidence requirements failed: ${e?.message ?? String(e)}`);
      return new Set();
    }
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

  /**
   * Phase B: attach healing rows when SelfHealingService can derive a follow-up PREVIEW input (e.g. TEMPORAL_SHIFT).
   */
  private buildSuggestiveHealingEnvelope(
    violations: PhysicalViolationItem[],
    actionInput: Record<string, unknown>,
  ): {
    suggested_healing_options?: SuggestedHealingOptionItemDto[];
    physical_validator_interrupt_mode?: 'INTERRUPT' | 'INTERRUPT_WITH_SUGGESTION';
  } {
    if (!this.selfHealing) return {};
    const raw = this.selfHealing.suggestOptions(violations, actionInput);
    if (!raw.length) return {};
    const suggested_healing_options: SuggestedHealingOptionItemDto[] = raw.map((opt) => {
      const healed =
        this.selfHealing!.buildHealedActionInput(opt, actionInput) ??
        ({ ...actionInput } as Record<string, unknown>);
      return {
        ...opt,
        healed_action_input: healed,
        healing_one_click_action_id: HEALING_ONE_CLICK_ACTION_ID,
      } as SuggestedHealingOptionItemDto;
    });
    return {
      suggested_healing_options,
      physical_validator_interrupt_mode: 'INTERRUPT_WITH_SUGGESTION',
    };
  }

  private async runPhysicalGate(
    tripId: string,
    actionInput?: Record<string, unknown> | null,
    source: 'action_preview' | 'action_commit' = 'action_preview',
  ): Promise<PhysicalEvaluationResult> {
    if (!this.physicalValidator) {
      const evaluated_at = new Date().toISOString();
      return {
        validator_version: PhysicalValidatorService.VALIDATOR_VERSION,
        rule_bundle_id: PhysicalValidatorService.RULE_BUNDLE_ID,
        violations: [],
        evaluated_at,
        blocking: false,
      };
    }
    const result = await this.physicalValidator.evaluate({ tripId, actionInput: actionInput ?? null });
    void this.persistPhysicalValidationSnapshot(tripId, result, actionInput, source);
    return result;
  }

  private async persistPhysicalValidationSnapshot(
    tripId: string,
    physical: PhysicalEvaluationResult,
    actionInput?: Record<string, unknown> | null,
    source: 'action_preview' | 'action_commit' = 'action_preview',
  ): Promise<void> {
    if (!tripId?.trim() || !this.prisma) return;
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return;
      const snapshot = buildTripPhysicalValidationSnapshot(physical, { actionInput, source });
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: mergeTripPhysicalValidationSnapshot(trip.metadata, snapshot),
        },
      });
    } catch (error) {
      this.logger.warn(
        `[ActionExecution] physical validation snapshot persist failed trip=${tripId}: ${(error as Error).message}`,
      );
    }
  }

  private userIntentFromPreviewActionInput(ai: Record<string, unknown>): DecisionState['userIntent'] | undefined {
    const wallet = ai.wallet as Record<string, unknown> | undefined;
    const budget =
      typeof wallet?.budget_limit === 'number' && wallet.budget_limit > 0
        ? wallet.budget_limit
        : typeof ai.budget === 'number' && (ai.budget as number) > 0
          ? (ai.budget as number)
          : undefined;
    const constraints = ai.constraints as Record<string, unknown> | undefined;
    if (budget == null && !constraints) return undefined;
    return {
      ...(budget != null ? { budget } : {}),
      ...(constraints ? { constraints } : {}),
    } as DecisionState['userIntent'];
  }

  private extractOntologyNounsFromActionInput(
    ai: Record<string, unknown>,
  ): NonNullable<NonNullable<DecisionState['travelOntologyState']>['nouns']> | undefined {
    try {
      if (ai.ontology_context && typeof ai.ontology_context === 'object') {
        return ontologyContextToNouns(ai.ontology_context as Parameters<typeof ontologyContextToNouns>[0]);
      }
      if (
        ai.travel_ontology &&
        typeof ai.travel_ontology === 'object' &&
        (ai.travel_ontology as Record<string, unknown>).nouns &&
        typeof (ai.travel_ontology as Record<string, unknown>).nouns === 'object'
      ) {
        return (ai.travel_ontology as Record<string, unknown>).nouns as NonNullable<
          NonNullable<DecisionState['travelOntologyState']>['nouns']
        >;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /** Per-violation severity after B-guarded budget drift rule (drift_ratio > 0.1 → INTERRUPT). */
  private effectiveViolationSeverity(v: PhysicalViolationItem): ActionSeverity {
    if (v.severity === 'BLOCK') return 'INTERRUPT';
    if (v.code === ViolationCode.TRAVEL_ONTOLOGY_BUDGET) {
      const drift = typeof v.degree === 'number' ? v.degree : 0;
      if (drift > 0.1) return 'INTERRUPT';
    }
    return violationStrategyForCode(v.code);
  }

  /** Aggregate heal router outcome for PhysicalValidator violations (empty → OK). */
  private determineActionSeverity(violations: PhysicalViolationItem[]): 'OK' | 'INTERRUPT' | 'SILENT_HEAL' {
    if (!violations.length) return 'OK';
    const levels = violations.map((v) => this.effectiveViolationSeverity(v));
    if (levels.some((l) => l === 'INTERRUPT')) return 'INTERRUPT';
    if (levels.every((l) => l === 'SILENT_HEAL')) return 'SILENT_HEAL';
    return 'INTERRUPT';
  }

  /**
   * MVP silent heal: proportional ontology price scale to satisfy budget (B-guarded: same POI inventory).
   * Time/route heals defer to Planner/Solver wrapper (Sprint 2 follow-up).
   */
  private async performSilentHealing(
    tripId: string,
    actionInput: Record<string, unknown>,
    physical: PhysicalEvaluationResult,
  ): Promise<{ physical: PhysicalEvaluationResult; actionInput: Record<string, unknown>; healing_summary: string } | null> {
    const violations = physical.violations;
    const allSilentBudgetDrift =
      violations.length > 0 &&
      violations.every(
        (v) =>
          v.code === ViolationCode.TRAVEL_ONTOLOGY_BUDGET &&
          v.severity !== 'BLOCK' &&
          (typeof v.degree !== 'number' || v.degree <= 0.1),
      );
    if (!allSilentBudgetDrift || !this.physicalValidator) return null;

    const nouns = this.extractOntologyNounsFromActionInput(actionInput);
    const userIntent = this.userIntentFromPreviewActionInput(actionInput);
    const cap = budgetCapFromUserIntent(userIntent);
    if (!nouns || cap == null) return null;

    const { scaled, factor } = scaleTravelOntologyNounsToBudgetCap(nouns, cap);
    const nextInput: Record<string, unknown> = { ...actionInput };
    nextInput.travel_ontology = {
      ...(typeof nextInput.travel_ontology === 'object' ? nextInput.travel_ontology : {}),
      nouns: scaled,
    };
    delete nextInput.ontology_context;

    const nextPhysical = await this.runPhysicalGate(tripId, nextInput);
    if (this.determineActionSeverity(nextPhysical.violations) === 'INTERRUPT') {
      this.logger.warn(`[ActionExecution] silent heal still INTERRUPT tier; escalating to blocked preview`);
      return null;
    }

    const summary =
      factor >= 1
        ? 'B-guarded silent heal: budget drift cleared without price scaling (POI set unchanged).'
        : `B-guarded silent heal: proportional price scale factor=${factor.toFixed(6)} to satisfy travel_ontology_budget (POI set unchanged).`;

    this.logger.log(`[ActionExecution] preview is_auto_healed=true healing_summary=${summary}`);
    return { physical: nextPhysical, actionInput: nextInput, healing_summary: summary };
  }

  private async recordSilentHealContingency(tripId: string, healingSummary: string): Promise<void> {
    if (!this.contingencyOrchestrator) return;
    try {
      await this.contingencyOrchestrator.trigger({
        tripId,
        reason: 'silent_heal:budget_drift',
        pathId: 'SILENT_HEAL',
        metadata: { success: true, healing_summary: healingSummary },
      });
    } catch (e: unknown) {
      this.logger.warn(
        `[ActionExecution] silent heal contingency SLO skipped: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  private computePhysicalGateFingerprint(physical: PhysicalEvaluationResult): string {
    if (this.physicalValidator) return this.physicalValidator.gateFingerprint(physical);
    return physicalGateFingerprint({
      validator_version: physical.validator_version,
      rule_bundle_id: physical.rule_bundle_id,
      violations: physical.violations,
    });
  }

  private hasPhysicalGateInputs(actionInput?: Record<string, unknown> | null): boolean {
    if (!actionInput || typeof actionInput !== 'object') return false;
    const ai = actionInput as Record<string, unknown>;
    const pd = ai.physical_domain as { segment_id?: string } | undefined;
    if (pd?.segment_id) return true;
    if (ai.ontology_context) return true;
    const tr = ai.travel_ontology as { nouns?: unknown } | undefined;
    if (tr?.nouns && typeof tr.nouns === 'object') return true;
    return false;
  }

  private requiresPhysicalVersionEcho(actionInput: unknown, physical: PhysicalEvaluationResult): boolean {
    if (!this.physicalValidator) return false;
    return this.hasPhysicalGateInputs(actionInput as Record<string, unknown>) || physical.violations.length > 0;
  }

  private physicalPreconditionsFromViolations(physical: PhysicalEvaluationResult): Array<{
    code: string;
    severity: 'INFO' | 'WARN' | 'BLOCK';
    message: string;
    path?: string;
  }> {
    return physical.violations.map((v) => ({
      code: v.code,
      severity: v.severity === 'BLOCK' ? ('BLOCK' as const) : ('WARN' as const),
      message: v.detail,
      path: 'physical_gate',
    }));
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

  private async buildResourceSnapshotForSignature(action: ActionCommitRequestDto['actions'][number]): Promise<Record<string, unknown> | null> {
    const ai = (action.action_input ?? {}) as Record<string, any>;
    const accountId =
      (typeof ai.accountId === 'string' && ai.accountId.trim()
        ? ai.accountId.trim()
        : typeof ai.account_id === 'string' && ai.account_id.trim()
          ? ai.account_id.trim()
          : typeof ai.wallet?.accountId === 'string' && ai.wallet.accountId.trim()
            ? ai.wallet.accountId.trim()
            : typeof ai.wallet?.account_id === 'string' && ai.wallet.account_id.trim()
              ? ai.wallet.account_id.trim()
              : 'default');
    const inventoryId =
      (typeof ai.inventoryId === 'string' && ai.inventoryId.trim()
        ? ai.inventoryId.trim()
        : typeof ai.inventory_id === 'string' && ai.inventory_id.trim()
          ? ai.inventory_id.trim()
          : typeof action.target_ref === 'string' && action.target_ref.trim()
            ? action.target_ref.trim()
            : null);
    if (!this.prisma?.isDbConnected()) {
      return {
        accountId,
        inventoryId,
        budgetAvailable:
          typeof ai.wallet?.available === 'number' && Number.isFinite(ai.wallet.available) ? ai.wallet.available : null,
        inventoryPrice: typeof ai.price === 'number' && Number.isFinite(ai.price) ? ai.price : null,
        inventoryAvailability:
          typeof ai.availability === 'string' && ai.availability.trim() ? ai.availability.trim() : null,
      };
    }
    const budget = await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId } });
    const fallbackBudget = budget
      ? null
      : await (this.prisma as any).physicalDomainBudget.findUnique({ where: { accountId: 'default' } });
    const inv = inventoryId
      ? await (this.prisma as any).physicalDomainInventoryItem.findUnique({ where: { id: inventoryId } })
      : null;
    return {
      accountId,
      inventoryId,
      budgetAvailable:
        typeof (budget ?? fallbackBudget)?.available === 'number'
          ? Number((budget ?? fallbackBudget).available)
          : null,
      inventoryPrice: typeof inv?.price === 'number' ? Number(inv.price) : null,
      inventoryAvailability:
        typeof inv?.availability === 'string' && inv.availability.trim() ? inv.availability.trim() : null,
    };
  }

  private buildContextSignatureV2(params: {
    action: ActionCommitRequestDto['actions'][number];
    actionName: string | null;
    assessment: { status: string; findings?: unknown[]; shadow_delta?: unknown | null };
    side_effects?: unknown[];
    resource_snapshot?: Record<string, unknown> | null;
    /** Fold PhysicalValidator gate into tripartite signature (PREVIEW/COMMIT alignment). */
    physicalGateFingerprint?: string | null;
  }): ContextSignatureV12Dto {
    const now = Date.now();
    const generatedAt = new Date(now).toISOString();
    const expiresAt = new Date(now + this.contextSignatureTtlMs).toISOString();
    const physicalHash = sha256Signature({
      action_id: params.action.action_id,
      action_type: params.action.action_type,
      target_type: params.action.target_type,
      target_ref: params.action.target_ref ?? null,
      shadow_delta: params.assessment?.shadow_delta ?? null,
      findings: params.assessment?.findings ?? [],
      physical_gate: params.physicalGateFingerprint ?? null,
    });
    const resourceHash = sha256Signature({
      action_input: params.action.action_input ?? null,
      side_effects: params.side_effects ?? [],
      resource_snapshot: params.resource_snapshot ?? null,
    });
    const policyVersion = this.resolvePolicyVersion(params.action, params.actionName);
    const signatureId = sha256Signature({
      physicalHash,
      resourceHash,
      policyVersion,
    });
    return {
      signatureId,
      physicalHash,
      resourceHash,
      policyVersion,
      generatedAt,
      expiresAt,
    };
  }

  private resolvePolicyVersion(
    action: ActionCommitRequestDto['actions'][number],
    actionName: string | null,
  ): string {
    const raw =
      (action.action_input as any)?.policyVersion ??
      (action.action_input as any)?.policy_version ??
      (action.action_input as any)?.policyLabVersion;
    if (typeof raw === 'string' && raw.trim()) {
      return raw.trim();
    }
    return `policy-lab:${sha256Signature({ action_name: actionName ?? null }).slice(0, 16)}`;
  }

  private findStaleDimensions(
    provided: ContextSignatureV12Dto | undefined,
    recomputed: ContextSignatureV12Dto,
  ): Array<'physicalHash' | 'resourceHash' | 'policyVersion'> {
    if (!provided) {
      return [];
    }
    const stale: Array<'physicalHash' | 'resourceHash' | 'policyVersion'> = [];
    if (String(provided.physicalHash ?? '') !== String(recomputed.physicalHash ?? '')) stale.push('physicalHash');
    if (String(provided.resourceHash ?? '') !== String(recomputed.resourceHash ?? '')) stale.push('resourceHash');
    if (String(provided.policyVersion ?? '') !== String(recomputed.policyVersion ?? '')) stale.push('policyVersion');
    return stale;
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
