import { Body, Controller, Inject, HttpCode, HttpStatus, Optional, Post, Get, Query, Param, Delete, Patch, HttpException } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiExtraModels, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FinancialHoldSideEffectParamsDto } from './dto/financial-hold-side-effect-params.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  ActionCommitRequestDto,
  ActionExecutionItemDto,
  ActionExecutionResponseDto,
  ActionPreviewRequestDto,
  ActionRollbackRequestDto,
} from './dto/action-execution.dto';
import { ActionExecutionService } from './services/action-execution.service';
import { PrismaService } from '../prisma/prisma.service';
import { FinancialHoldStoreService } from './services/financial-hold-store.service';
import { SideEffectParamResolverService } from './services/side-effect-param-resolver.service';
import { SideEffectRuleSyncerService } from './services/side-effect-rule-syncer.service';
import { ActionGraphSagaCompilerService } from './services/action-graph-saga-compiler.service';
import {
  SideEffectParamPatchesBodyDto,
  SideEffectParamReplaceBodyDto,
} from './dto/side-effect-param-override.dto';
import { SideEffectRuleUpsertBodyDto } from './dto/side-effect-rule-row.dto';
import { HardTruthRuleUpsertBodyDto } from './dto/hard-truth-rule-row.dto';
import { validateHardTruthRuleParams } from './dto/hard-truth-rule.validation';
import { HARD_TRUTH_GLOBAL_ACTION } from './constants/hard-truth-rule.constants';
import { assertSideEffectParamsForHandler } from './dto/side-effect-params.validation';
import {
  getActionLabel,
  getHandlerLabel,
  getParamsSchemaForActionHandler,
  getSupportedActionDefaults,
  getSupportedHandlerDefaults,
  isSupportedActionHandlerPair,
  SIDE_EFFECT_RULE_META_SCHEMA_VERSION,
  SIDE_EFFECT_RULE_SCHEMA_VERSION,
} from './constants/side-effect-rule-schema.dictionary';
import type { IDsoFeedbackPersistence } from '../decision/kernel/dso-feedback-persistence.interface';
import { DSO_FEEDBACK_PERSISTENCE } from '../decision/kernel/dso-feedback-persistence.interface';
import type { DecisionState } from '../decision/kernel/decision-state.types';
import { projectJepaZStateFromDecisionState } from './services/jepa-z-state.projection';
import { ActionGraph, SagaCompileResult } from './interfaces/action-graph.interface';
import { isActionType } from './contracts/action-sideeffect.contract';
import {
  ACTIONS_ROLLBACK_PRODUCT_LABEL,
  ACTIONS_ROLLBACK_PRODUCT_STATUS,
  ACTIONS_ROLLBACK_STUB_MESSAGE,
} from './contracts/rollback-corridor.product.constants';

@ApiTags('agent-actions')
@ApiBearerAuth()
@ApiExtraModels(FinancialHoldSideEffectParamsDto)
@Controller('agent/actions')
export class ActionsController {
  private static readonly COMPENSATION_POLICY_ACTION = '__admin__.compensation_policy';
  private static readonly EVIDENCE_REQUIREMENT_ACTION = '__admin__.evidence_requirement';
  private static readonly RETRY_POLICY_ACTION = '__admin__.retry_policy';
  private static readonly MANUAL_REVIEW_STATUS = ['PENDING', 'PROCESSING', 'RESOLVED'] as const;
  private static readonly SIDE_EFFECT_TYPES = ['FINANCIAL_HOLD', 'RESOURCE_LOCK', 'INVENTORY_LOCK'] as const;
  // Backward-compatible business action enums (legacy frontend options).
  private static readonly BUSINESS_ACTION_TYPES = ['BOOKING_CREATE', 'BOOKING_COMMIT', 'PAYMENT_CAPTURE', 'BOOKING_CANCEL'] as const;
  private static readonly COMPENSATION_ACTION_TYPES = [
    'FINANCIAL_REFUND',
    'RESOURCE_RELEASE',
    'INVENTORY_RELEASE',
    'BOOKING_CANCEL',
  ] as const;
  private static readonly COMPENSATION_CANONICAL_BY_SIDE_EFFECT: Record<string, string[]> = {
    FINANCIAL_HOLD: ['FINANCIAL_REFUND'],
    RESOURCE_LOCK: ['RESOURCE_RELEASE'],
    INVENTORY_LOCK: ['INVENTORY_RELEASE', 'BOOKING_CANCEL'],
  };
  private static readonly EVIDENCE_TYPES = ['EvidenceCard', 'AuditTrail', 'Receipt'] as const;
  private static readonly RETRY_STRATEGIES = ['none', 'fixed_interval', 'exponential_backoff'] as const;
  private readonly compensationPolicies = new Map<
    string,
    {
      id: string;
      sideEffectType: string;
      compensationActionType: string;
      compensationActionTypeCanonical: string;
      compensationActionTypeRaw?: string;
      isLegacyNormalized: boolean;
      enabled: boolean;
      updatedAt: string;
    }
  >();
  private readonly evidenceRequirements = new Map<
    string,
    {
      id: string;
      actionType: string;
      evidenceType: string;
      required: boolean;
      updatedAt: string;
    }
  >();
  private readonly retryPolicies = new Map<
    string,
    {
      id: string;
      sideEffectType: string;
      retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff';
      maxRetry: number;
      intervalMs: number;
      enabled: boolean;
      updatedAt: string;
    }
  >();
  private readonly manualReviewQueue = new Map<
    string,
    {
      queueId: string;
      actionId: string;
      sideEffectId: string;
      reasonCode: string;
      status: 'PENDING' | 'PROCESSING' | 'RESOLVED';
      createdAt: string;
      updatedAt: string;
      comment?: string;
      operator?: string;
      resolution?: string;
    }
  >();

  constructor(
    private readonly actionExecutionService: ActionExecutionService,
    private readonly actionGraphSagaCompilerService: ActionGraphSagaCompilerService,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly financialHoldStore?: FinancialHoldStoreService,
    @Optional() private readonly sideEffectParamResolver?: SideEffectParamResolverService,
    @Optional() private readonly sideEffectRuleSyncer?: SideEffectRuleSyncerService,
    @Optional() @Inject(DSO_FEEDBACK_PERSISTENCE) private readonly dsoFeedbackPersistence?: IDsoFeedbackPersistence,
  ) {
    const now = new Date().toISOString();
    this.manualReviewQueue.set('mrq_001', {
      queueId: 'mrq_001',
      actionId: 'act_001',
      sideEffectId: 'se_001',
      reasonCode: 'NO_COMPENSATION_PATH',
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    });
  }

  private canUseDb(): boolean {
    return Boolean(this.prisma?.isDbConnected?.());
  }

  private createErrorPayload(code: string, message: string, details: Array<{ field: string; reason: string }>) {
    return {
      ok: false as const,
      error: {
        code,
        message,
        details,
      },
    };
  }

  private throwValidationError(details: Array<{ field: string; reason: string }>): never {
    throw new HttpException(this.createErrorPayload('VALIDATION_ERROR', '参数校验失败', details), HttpStatus.BAD_REQUEST);
  }

  private throwNotFoundError(field: string, reason: string): never {
    throw new HttpException(
      this.createErrorPayload('NOT_FOUND', '资源不存在', [{ field, reason }]),
      HttpStatus.NOT_FOUND,
    );
  }

  private normalizeCompensationActionType(
    sideEffectType: string,
    compensationActionType: string,
  ): { canonical: string; raw?: string; isLegacyNormalized: boolean } {
    // Legacy compatibility: BOOKING_CANCEL is normalized into INVENTORY_RELEASE semantics.
    if (sideEffectType === 'INVENTORY_LOCK' && compensationActionType === 'BOOKING_CANCEL') {
      return { canonical: 'INVENTORY_RELEASE', raw: 'BOOKING_CANCEL', isLegacyNormalized: true };
    }
    return { canonical: compensationActionType, isLegacyNormalized: false };
  }

  private async buildRuleMetaDictionary(): Promise<{
    actionNames: string[];
    handlerIds: string[];
  }> {
    const setAction = new Set<string>();
    const setHandler = new Set<string>();
    if (this.sideEffectRuleSyncer) {
      const rows = await this.sideEffectRuleSyncer.listActiveSideEffectRules();
      for (const r of rows) {
        setAction.add(String(r.actionName));
        setHandler.add(String(r.handlerId));
      }
      const effective = await this.sideEffectRuleSyncer.getEffectiveRulesForAdmin();
      for (const row of effective.rows) {
        setAction.add(String(row.actionName));
        setHandler.add(String(row.handlerId));
      }
    }
    if (setAction.size === 0) {
      getSupportedActionDefaults().forEach((a) => setAction.add(a));
    }
    getSupportedActionDefaults().forEach((a) => setAction.add(a));
    getSupportedHandlerDefaults().forEach((h) => setHandler.add(h));
    return {
      actionNames: Array.from(setAction.values()).sort(),
      handlerIds: Array.from(setHandler.values()).sort(),
    };
  }

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

  @Post('graph/compile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Compile ActionGraph into staged Saga execution plan' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        graphId: { type: 'string' },
        decisionId: { type: 'string' },
        nodes: { type: 'array', items: { type: 'object' } },
        edges: { type: 'array', items: { type: 'object' } },
        contextSignature: { type: 'object' },
        createdAt: { type: 'string' },
      },
      required: ['graphId', 'decisionId', 'nodes', 'edges', 'contextSignature', 'createdAt'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Compile result with plan when valid, or rule errors when invalid.',
  })
  async compileActionGraph(@Body() graph: ActionGraph): Promise<SagaCompileResult> {
    const invalidTypeNode = (graph?.nodes ?? []).find((n: any) => !isActionType(String(n?.actionType ?? '')));
    if (invalidTypeNode) {
      this.throwValidationError([
        {
          field: `nodes.${String(invalidTypeNode.nodeId ?? 'unknown')}.actionType`,
          reason: `unsupported actionType: ${String(invalidTypeNode.actionType ?? '')}`,
        },
      ]);
    }
    return this.actionGraphSagaCompilerService.compile(graph);
  }

  @Get('registry')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List registered actions for frontend mapping UI' })
  async getActionRegistry(): Promise<{
    ok: boolean;
    total: number;
    actions: Array<{
      name: string;
      description: string;
      category: string;
      side_effect_handlers: string[];
      preconditions: string[];
    }>;
  }> {
    const catalog = this.actionExecutionService.getActionRegistryCatalog();
    return { ok: true, ...catalog };
  }

  @Post('mapping/simulate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate action_type + target_type to action_name mapping' })
  async simulateActionMapping(
    @Body()
    body: {
      action_type: string;
      target_type: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
      action_name?: string;
    },
  ): Promise<{
    ok: boolean;
    mapping: {
      action_type: string;
      normalized_action_type: string;
      target_type: string;
      mapped_action_name: string | null;
      exists_in_registry: boolean;
      source: 'explicit' | 'mapping';
    };
  }> {
    return {
      ok: true,
      mapping: this.actionExecutionService.simulateActionNameMapping(body),
    };
  }

  @Post('compensation-policies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update compensation policy' })
  async upsertCompensationPolicy(
    @Body() body: { id: string; sideEffectType: string; compensationActionType: string; enabled: boolean },
  ): Promise<any> {
    const id = String(body?.id ?? '').trim();
    const sideEffectType = String(body?.sideEffectType ?? '').trim();
    const compensationActionType = String(body?.compensationActionType ?? '').trim();
    const details: Array<{ field: string; reason: string }> = [];
    if (!id || !sideEffectType || !compensationActionType) {
      if (!id) details.push({ field: 'id', reason: 'required' });
      if (!sideEffectType) details.push({ field: 'sideEffectType', reason: 'required' });
      if (!compensationActionType) details.push({ field: 'compensationActionType', reason: 'required' });
    }
    if (sideEffectType && !ActionsController.SIDE_EFFECT_TYPES.includes(sideEffectType as any)) {
      details.push({ field: 'sideEffectType', reason: 'unsupported sideEffectType' });
    }
    if (compensationActionType && !ActionsController.COMPENSATION_ACTION_TYPES.includes(compensationActionType as any)) {
      details.push({ field: 'compensationActionType', reason: 'unsupported compensationActionType' });
    }
    if (
      sideEffectType &&
      compensationActionType &&
      ActionsController.COMPENSATION_CANONICAL_BY_SIDE_EFFECT[sideEffectType] &&
      !ActionsController.COMPENSATION_CANONICAL_BY_SIDE_EFFECT[sideEffectType]!.includes(compensationActionType)
    ) {
      details.push({
        field: 'compensationActionType',
        reason: `invalid pair for sideEffectType=${sideEffectType}`,
      });
    }
    if (details.length > 0) {
      this.throwValidationError(details);
    }
    const normalized = this.normalizeCompensationActionType(sideEffectType, compensationActionType);
    if (sideEffectType === compensationActionType || sideEffectType === normalized.canonical) {
      this.throwValidationError([{ field: 'sideEffectType,compensationActionType', reason: 'types cannot be the same' }]);
    }

    let existingByPair:
      | {
          id: string;
          sideEffectType: string;
          compensationActionType: string;
          compensationActionTypeCanonical: string;
          compensationActionTypeRaw?: string;
          isLegacyNormalized: boolean;
          enabled: boolean;
          updatedAt: string;
        }
      | undefined;
    if (this.canUseDb()) {
      const rows = await this.prisma!.decisionRuleConfig.findMany({
        where: { actionName: ActionsController.COMPENSATION_POLICY_ACTION, isActive: true },
      });
      existingByPair = rows
        .map((r) => {
          const p = (r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {}) as any;
          return {
            id: String(r.handlerId),
            sideEffectType: String(p.sideEffectType ?? ''),
            compensationActionType: String(p.compensationActionType ?? ''),
            compensationActionTypeCanonical: String(p.compensationActionTypeCanonical ?? p.compensationActionType ?? ''),
            compensationActionTypeRaw: p.compensationActionTypeRaw ? String(p.compensationActionTypeRaw) : undefined,
            isLegacyNormalized: Boolean(p.isLegacyNormalized),
            enabled: Boolean(p.enabled),
            updatedAt: r.updatedAt.toISOString(),
          };
        })
        .find((x) => x.sideEffectType === sideEffectType && x.compensationActionTypeCanonical === normalized.canonical);
    } else {
      existingByPair = Array.from(this.compensationPolicies.values()).find(
        (x) => x.sideEffectType === sideEffectType && x.compensationActionTypeCanonical === normalized.canonical,
      );
    }
    const resolvedId = existingByPair?.id ?? id;
    const item = {
      id: resolvedId,
      sideEffectType,
      compensationActionType: compensationActionType,
      compensationActionTypeCanonical: normalized.canonical,
      ...(normalized.raw ? { compensationActionTypeRaw: normalized.raw } : {}),
      isLegacyNormalized: normalized.isLegacyNormalized,
      enabled: Boolean(body?.enabled),
      updatedAt: new Date().toISOString(),
    };
    if (this.canUseDb()) {
      await this.prisma!.decisionRuleConfig.upsert({
        where: {
          actionName_handlerId: {
            actionName: ActionsController.COMPENSATION_POLICY_ACTION,
            handlerId: resolvedId,
          },
        },
        update: {
          params: item as any,
          isActive: true,
        },
        create: {
          actionName: ActionsController.COMPENSATION_POLICY_ACTION,
          handlerId: resolvedId,
          params: item as any,
          isActive: true,
        },
      });
    } else {
      if (existingByPair && existingByPair.id !== resolvedId) {
        this.compensationPolicies.delete(existingByPair.id);
      }
      this.compensationPolicies.set(resolvedId, item);
    }
    return { ok: true, item };
  }

  @Get('compensation-policies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List compensation policies' })
  async listCompensationPolicies(@Query('sideEffectType') sideEffectType?: string): Promise<any> {
    if (
      sideEffectType &&
      !ActionsController.SIDE_EFFECT_TYPES.includes(sideEffectType as any)
    ) {
      this.throwValidationError([{ field: 'sideEffectType', reason: 'unsupported sideEffectType' }]);
    }
    const baseRows = this.canUseDb()
      ? (
          await this.prisma!.decisionRuleConfig.findMany({
            where: { actionName: ActionsController.COMPENSATION_POLICY_ACTION, isActive: true },
          })
        ).map((r) => {
          const p = (r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {}) as any;
          return {
            id: String(r.handlerId),
            sideEffectType: String(p.sideEffectType ?? ''),
            compensationActionType: String(p.compensationActionType ?? ''),
            compensationActionTypeCanonical: p.compensationActionTypeCanonical
              ? String(p.compensationActionTypeCanonical)
              : undefined,
            compensationActionTypeRaw: p.compensationActionTypeRaw ? String(p.compensationActionTypeRaw) : undefined,
            isLegacyNormalized: Boolean(p.isLegacyNormalized),
            enabled: Boolean(p.enabled),
            updatedAt: r.updatedAt.toISOString(),
          };
        })
      : Array.from(this.compensationPolicies.values());
    const items = baseRows.map((row) => {
      if (row.compensationActionTypeCanonical) return row;
      const normalized = this.normalizeCompensationActionType(row.sideEffectType, row.compensationActionType);
      return {
        ...row,
        compensationActionTypeCanonical: normalized.canonical,
        ...(normalized.raw ? { compensationActionTypeRaw: normalized.raw } : {}),
        isLegacyNormalized: normalized.isLegacyNormalized,
      };
    });
    const filtered = sideEffectType ? items.filter((x) => x.sideEffectType === sideEffectType) : items;
    return { ok: true, items: filtered };
  }

  @Delete('compensation-policies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete compensation policy by id' })
  async deleteCompensationPolicy(@Param('id') id: string): Promise<any> {
    if (this.canUseDb()) {
      await this.prisma!.decisionRuleConfig.updateMany({
        where: { actionName: ActionsController.COMPENSATION_POLICY_ACTION, handlerId: String(id) },
        data: { isActive: false },
      });
    } else {
      this.compensationPolicies.delete(String(id));
    }
    return { ok: true };
  }

  @Post('evidence-requirements')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update evidence requirement' })
  async upsertEvidenceRequirement(
    @Body() body: { id: string; actionType: string; evidenceType: string; required: boolean },
  ): Promise<any> {
    const id = String(body?.id ?? '').trim();
    const actionType = String(body?.actionType ?? '').trim();
    const evidenceType = String(body?.evidenceType ?? '').trim();
    const details: Array<{ field: string; reason: string }> = [];
    if (!id || !actionType || !evidenceType) {
      if (!id) details.push({ field: 'id', reason: 'required' });
      if (!actionType) details.push({ field: 'actionType', reason: 'required' });
      if (!evidenceType) details.push({ field: 'evidenceType', reason: 'required' });
    }
    if (actionType && !ActionsController.SIDE_EFFECT_TYPES.includes(actionType as any)) {
      if (!ActionsController.BUSINESS_ACTION_TYPES.includes(actionType as any)) {
        details.push({ field: 'actionType', reason: 'unsupported actionType' });
      }
    }
    if (evidenceType && !ActionsController.EVIDENCE_TYPES.includes(evidenceType as any)) {
      details.push({ field: 'evidenceType', reason: 'unsupported evidenceType' });
    }
    if (details.length > 0) {
      this.throwValidationError(details);
    }
    const item = { id, actionType, evidenceType, required: Boolean(body?.required), updatedAt: new Date().toISOString() };
    if (this.canUseDb()) {
      await this.prisma!.decisionRuleConfig.upsert({
        where: {
          actionName_handlerId: {
            actionName: ActionsController.EVIDENCE_REQUIREMENT_ACTION,
            handlerId: id,
          },
        },
        update: {
          params: item as any,
          isActive: true,
        },
        create: {
          actionName: ActionsController.EVIDENCE_REQUIREMENT_ACTION,
          handlerId: id,
          params: item as any,
          isActive: true,
        },
      });
    } else {
      this.evidenceRequirements.set(id, item);
    }
    return { ok: true, item };
  }

  @Get('evidence-requirements')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List evidence requirements' })
  async listEvidenceRequirements(): Promise<any> {
    if (this.canUseDb()) {
      const rows = await this.prisma!.decisionRuleConfig.findMany({
        where: { actionName: ActionsController.EVIDENCE_REQUIREMENT_ACTION, isActive: true },
      });
      const items = rows.map((r) => {
        const p = (r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {}) as any;
        return {
          id: String(r.handlerId),
          actionType: String(p.actionType ?? ''),
          evidenceType: String(p.evidenceType ?? ''),
          required: Boolean(p.required),
          updatedAt: r.updatedAt.toISOString(),
        };
      });
      return { ok: true, items };
    }
    return { ok: true, items: Array.from(this.evidenceRequirements.values()) };
  }

  @Delete('evidence-requirements/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete evidence requirement by id' })
  async deleteEvidenceRequirement(@Param('id') id: string): Promise<any> {
    if (this.canUseDb()) {
      await this.prisma!.decisionRuleConfig.updateMany({
        where: { actionName: ActionsController.EVIDENCE_REQUIREMENT_ACTION, handlerId: String(id) },
        data: { isActive: false },
      });
    } else {
      this.evidenceRequirements.delete(String(id));
    }
    return { ok: true };
  }

  @Post('retry-policies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or update retry policy' })
  async upsertRetryPolicy(
    @Body()
    body: {
      id: string;
      sideEffectType: string;
      retryStrategy: 'none' | 'fixed_interval' | 'exponential_backoff';
      maxRetry: number;
      intervalMs: number;
      enabled: boolean;
    },
  ): Promise<any> {
    const id = String(body?.id ?? '').trim();
    const sideEffectType = String(body?.sideEffectType ?? '').trim();
    const retryStrategy = String(body?.retryStrategy ?? '').trim() as 'none' | 'fixed_interval' | 'exponential_backoff';
    const maxRetry = Number(body?.maxRetry ?? 0);
    const intervalMs = Number(body?.intervalMs ?? 0);
    const details: Array<{ field: string; reason: string }> = [];
    if (!id || !sideEffectType || !retryStrategy) {
      if (!id) details.push({ field: 'id', reason: 'required' });
      if (!sideEffectType) details.push({ field: 'sideEffectType', reason: 'required' });
      if (!retryStrategy) details.push({ field: 'retryStrategy', reason: 'required' });
    }
    if (sideEffectType && !ActionsController.SIDE_EFFECT_TYPES.includes(sideEffectType as any)) {
      details.push({ field: 'sideEffectType', reason: 'unsupported sideEffectType' });
    }
    if (retryStrategy && !ActionsController.RETRY_STRATEGIES.includes(retryStrategy as any)) {
      details.push({ field: 'retryStrategy', reason: 'unsupported retryStrategy' });
    }
    if (!Number.isFinite(maxRetry) || maxRetry < 0) {
      details.push({ field: 'maxRetry', reason: 'must be >= 0' });
    }
    if (!Number.isFinite(intervalMs) || intervalMs < 0) {
      details.push({ field: 'intervalMs', reason: 'must be >= 0' });
    }
    if (details.length > 0) this.throwValidationError(details);
    const item = {
      id,
      sideEffectType,
      retryStrategy,
      maxRetry: Math.floor(maxRetry),
      intervalMs: Math.floor(intervalMs),
      enabled: Boolean(body?.enabled),
      updatedAt: new Date().toISOString(),
    };
    if (this.canUseDb()) {
      await this.prisma!.decisionRuleConfig.upsert({
        where: {
          actionName_handlerId: {
            actionName: ActionsController.RETRY_POLICY_ACTION,
            handlerId: id,
          },
        },
        update: {
          params: item as any,
          isActive: true,
        },
        create: {
          actionName: ActionsController.RETRY_POLICY_ACTION,
          handlerId: id,
          params: item as any,
          isActive: true,
        },
      });
    } else {
      this.retryPolicies.set(id, item);
    }
    return { ok: true, item };
  }

  @Get('retry-policies')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List retry policies' })
  async listRetryPolicies(): Promise<any> {
    if (this.canUseDb()) {
      const rows = await this.prisma!.decisionRuleConfig.findMany({
        where: { actionName: ActionsController.RETRY_POLICY_ACTION, isActive: true },
      });
      const items = rows.map((r) => {
        const p = (r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {}) as any;
        return {
          id: String(r.handlerId),
          sideEffectType: String(p.sideEffectType ?? ''),
          retryStrategy: String(p.retryStrategy ?? 'none'),
          maxRetry: Number(p.maxRetry ?? 0),
          intervalMs: Number(p.intervalMs ?? 0),
          enabled: Boolean(p.enabled),
          updatedAt: r.updatedAt.toISOString(),
        };
      });
      return { ok: true, items };
    }
    return { ok: true, items: Array.from(this.retryPolicies.values()) };
  }

  @Delete('retry-policies/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete retry policy by id' })
  async deleteRetryPolicy(@Param('id') id: string): Promise<any> {
    if (this.canUseDb()) {
      await this.prisma!.decisionRuleConfig.updateMany({
        where: { actionName: ActionsController.RETRY_POLICY_ACTION, handlerId: String(id) },
        data: { isActive: false },
      });
    } else {
      this.retryPolicies.delete(String(id));
    }
    return { ok: true };
  }

  @Get('manual-review-queue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List manual review queue' })
  async listManualReviewQueue(@Query('status') status?: 'PENDING' | 'PROCESSING' | 'RESOLVED'): Promise<any> {
    if (status && !ActionsController.MANUAL_REVIEW_STATUS.includes(status as any)) {
      this.throwValidationError([{ field: 'status', reason: 'unsupported status' }]);
    }
    const all = Array.from(this.manualReviewQueue.values());
    const items = status ? all.filter((i) => i.status === status) : all;
    return { ok: true, items };
  }

  @Post('manual-review-queue/:id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve manual review item' })
  async resolveManualReviewQueueItem(
    @Param('id') id: string,
    @Body() body: { resolution: string; operator: string },
  ): Promise<any> {
    const row = this.manualReviewQueue.get(String(id));
    if (!row) {
      this.throwNotFoundError('id', 'queue item not found');
    }
    row.status = 'RESOLVED';
    row.resolution = String(body?.resolution ?? '');
    row.operator = String(body?.operator ?? '');
    row.updatedAt = new Date().toISOString();
    this.manualReviewQueue.set(row.queueId, row);
    return { ok: true };
  }

  @Patch('manual-review-queue/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update manual review queue item status/comment' })
  async updateManualReviewQueueItem(
    @Param('id') id: string,
    @Body() body: { status?: 'PENDING' | 'PROCESSING' | 'RESOLVED'; comment?: string; operator?: string },
  ): Promise<any> {
    const row = this.manualReviewQueue.get(String(id));
    if (!row) {
      this.throwNotFoundError('id', 'queue item not found');
    }
    if (body?.status && !['PENDING', 'PROCESSING', 'RESOLVED'].includes(String(body.status))) {
      this.throwValidationError([{ field: 'status', reason: 'unsupported status' }]);
    }
    row.status = (body?.status as any) ?? row.status;
    row.comment = body?.comment ?? row.comment;
    row.operator = body?.operator ?? row.operator;
    row.updatedAt = new Date().toISOString();
    this.manualReviewQueue.set(row.queueId, row);
    return { ok: true, item: row };
  }

  @Post('rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: `Rollback committed actions [${ACTIONS_ROLLBACK_PRODUCT_STATUS}]`,
    description: ACTIONS_ROLLBACK_PRODUCT_LABEL,
  })
  @ApiBody({ type: ActionRollbackRequestDto })
  @ApiResponse({
    status: 200,
    type: ActionExecutionResponseDto,
    description: `${ACTIONS_ROLLBACK_PRODUCT_STATUS}: HTTP OK does not reverse commits or side effects.`,
    schema: {
      example: {
        status: 'OK',
        message: ACTIONS_ROLLBACK_STUB_MESSAGE,
        accepted_actions: [],
        product_status: ACTIONS_ROLLBACK_PRODUCT_STATUS,
      },
    },
  })
  async rollback(@Body() request: ActionRollbackRequestDto): Promise<ActionExecutionResponseDto> {
    return this.actionExecutionService.rollback(request);
  }

  @Get('holds')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'List active side-effect holds (monitor)' })
  @ApiResponse({
    status: 200,
    description: 'Active holds for a trip (pruned by expires_at).',
    schema: {
      example: {
        trip_id: 'trip_001',
        now: '2026-04-26T06:53:43.834Z',
        holds: [
          {
            hold_id: 'hold_act_123',
            type: 'FINANCIAL_HOLD',
            action_id: 'act_123',
            action_name: 'trip.apply_user_edit',
            expires_at: '2026-04-26T06:53:43.834Z',
            remaining_ms: 512345,
          },
        ],
      },
    },
  })
  async listHolds(@Query('trip_id') trip_id: string): Promise<any> {
    const now = new Date();
    if (!this.financialHoldStore || !String(trip_id ?? '').trim()) {
      return { trip_id, now: now.toISOString(), holds: [] };
    }
    const rows = await this.financialHoldStore.listByTrip(trip_id);
    const holds = rows.map((h) => {
      const exp = Date.parse(h.expires_at);
      const remaining_ms = Number.isFinite(exp) ? Math.max(0, exp - now.getTime()) : 0;
      return {
        hold_id: h.hold_id,
        type: 'FINANCIAL_HOLD',
        action_id: h.action_id,
        action_name: h.action_name,
        expires_at: h.expires_at,
        remaining_ms,
      };
    });
    return { trip_id, now: now.toISOString(), holds };
  }

  @Post('holds/expire')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Expire a hold token (manual release)' })
  @ApiResponse({
    status: 200,
    description: 'Expire a hold by hold_id.',
    schema: { example: { ok: true, hold_id: 'hold_a1', expired: true } },
  })
  async expireHold(@Body() body: { hold_id?: string }): Promise<any> {
    const hold_id = String(body?.hold_id ?? '').trim();
    if (!this.financialHoldStore || !hold_id) {
      return { ok: false, hold_id, expired: false };
    }
    const expired = await this.financialHoldStore.expire(hold_id);
    return { ok: true, hold_id, expired };
  }

  @Post('holds/refresh-preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Recompute preview for an action (self-healing UX)' })
  @ApiBody({
    schema: {
      example: {
        request_id: 'req-1',
        trip_id: 'trip-1',
        action: {
          action_id: 'a1',
          action_type: 'BOOK',
          target_type: 'FLIGHT',
          action_name: 'trip.apply_user_edit',
          action_input: { price: 500, currency: 'USD', wallet: { balance: 2000, currency: 'USD' } },
          risk_level: 'LOW',
          requires_confirmation: false,
          context_signature: 'sha256:...',
          preview_snapshot: { shadow_delta: { resources: { budget: { current: 2000, delta: -500, after: 1500, currency: 'USD' } } } },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Returns fresh preview plus an optional comparison payload.',
  })
  async refreshPreview(@Body() body: { request_id: string; trip_id: string; execution_mode?: 'ADVICE_ONLY' | 'SEMI_AUTO' | 'AUTO'; action: ActionExecutionItemDto }): Promise<any> {
    const request_id = String(body?.request_id ?? '').trim();
    const trip_id = String(body?.trip_id ?? '').trim();
    const action = body?.action as ActionExecutionItemDto | undefined;
    if (!request_id || !trip_id || !action) {
      return { ok: false, message: 'Missing request_id/trip_id/action' };
    }
    const execution_mode =
      body?.execution_mode === 'SEMI_AUTO' || body?.execution_mode === 'AUTO' ? body.execution_mode : 'ADVICE_ONLY';
    const fresh = await this.actionExecutionService.preview({
      request_id,
      trip_id,
      execution_mode,
      actions: [action],
    } as any);
    return {
      ok: true,
      preview: fresh,
      comparison: {
        original_snapshot: (action as any).preview_snapshot ?? null,
        recomputed_assessment: fresh.action_previews?.[0] ?? null,
      },
    };
  }

  @Get('decision-rules/side-effect-params')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Runtime SideEffect param overrides (layer-2 config)',
    description:
      'Returns revision and merged patches over ActionRegistry defaults. ' +
      'Load initial file via DECISION_RULE_OVERRIDES_PATH; use PATCH/REPLACE to align with a future admin DB or Redis stream.',
  })
  @ApiResponse({ status: 200, description: 'Current override snapshot' })
  getSideEffectParamOverrides(): { ok: boolean; revision: number; overrides: Record<string, Record<string, Record<string, any>>> } {
    if (!this.sideEffectParamResolver) {
      return { ok: false, revision: 0, overrides: {} };
    }
    const snap = this.sideEffectParamResolver.getSnapshot();
    return { ok: true, ...snap };
  }

  @Get('decision-rules/side-effect-params/rules')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'List active SideEffect rules (DecisionRuleConfig rows)',
    description:
      'Returns active `DecisionRuleConfig` rows. ' +
      'By default (`scope=side_effect`) only lists SideEffect param override rows (excludes `__global__/hard_truth.*`). ' +
      'Use `scope=hard_truth` for global hard-truth knobs, or `scope=all` to return both with `rule_kind`. ' +
      'Use `/side-effect-params` for the merged in-memory overrides map.',
  })
  @ApiResponse({ status: 200, description: 'Active rule rows' })
  @ApiQuery({
    name: 'scope',
    required: false,
    enum: ['side_effect', 'hard_truth', 'all'],
    description: 'Defaults to `side_effect`. Use `all` to include `__global__/hard_truth.*` rows.',
  })
  async listSideEffectRules(
    @Query('scope') scope?: 'side_effect' | 'hard_truth' | 'all',
  ): Promise<{
    ok: boolean;
    rules: Array<{
      rule_kind: 'side_effect' | 'hard_truth';
      id: string;
      action_name: string;
      handler_id: string;
      params: Record<string, any>;
      updated_at: string;
    }>;
    message?: string;
  }> {
    if (!this.sideEffectRuleSyncer) {
      return { ok: false, rules: [], message: 'SideEffectRuleSyncerService not available (database or module)' };
    }
    const s = scope ?? 'side_effect';
    const side = await this.sideEffectRuleSyncer.listActiveSideEffectRules();
    const hard = await this.sideEffectRuleSyncer.listActiveHardTruthRules();
    const picked =
      s === 'hard_truth' ? hard.map((r) => ({ r, rule_kind: 'hard_truth' as const })) : s === 'all'
        ? [
            ...side.map((r) => ({ r, rule_kind: 'side_effect' as const })),
            ...hard.map((r) => ({ r, rule_kind: 'hard_truth' as const })),
          ]
        : side.map((r) => ({ r, rule_kind: 'side_effect' as const }));

    return {
      ok: true,
      rules: picked.map(({ r, rule_kind }) => ({
        rule_kind,
        id: String(r.id),
        action_name: String(r.actionName),
        handler_id: String(r.handlerId),
        params: (r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {}) as any,
        updated_at: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : new Date(String(r.updatedAt)).toISOString(),
      })),
    };
  }

  @Get('decision-rules/side-effect-params/rules/meta')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Action + side-effect handler dictionary for dropdowns' })
  async getSideEffectRuleMeta(): Promise<{
    schema_version: string;
    updated_at: string;
    action_names: Array<{ value: string; label: string }>;
    handler_ids: Array<{ value: string; label: string }>;
  }> {
    const dict = await this.buildRuleMetaDictionary();
    return {
      schema_version: SIDE_EFFECT_RULE_META_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      action_names: dict.actionNames.map((v) => ({ value: v, label: getActionLabel(v) })),
      handler_ids: dict.handlerIds.map((v) => ({ value: v, label: getHandlerLabel(v) })),
    };
  }

  @Get('decision-rules/side-effect-params/rules/schema')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get params JSON schema by action_name + handler_id' })
  @ApiQuery({ name: 'action_name', required: true, type: String })
  @ApiQuery({ name: 'handler_id', required: true, type: String })
  async getSideEffectRuleSchema(
    @Query('action_name') actionName: string,
    @Query('handler_id') handlerId: string,
  ): Promise<{
    ok: boolean;
    schema_version: string;
    updated_at: string;
    action_name: string;
    handler_id: string;
    schema?: Record<string, any>;
    error?: {
      code: 'VALIDATION_ERROR';
      message: string;
      details: Array<{ field: string; reason: string }>;
    };
  }> {
    const dict = await this.buildRuleMetaDictionary();
    const an = String(actionName ?? '').trim();
    const hid = String(handlerId ?? '').trim();
    if (!an || !dict.actionNames.includes(an)) {
      return {
        ok: false,
        schema_version: SIDE_EFFECT_RULE_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
        action_name: an,
        handler_id: hid,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'action_name validation failed',
          details: [{ field: 'action_name', reason: 'unsupported action_name' }],
        },
      };
    }
    if (!hid || !dict.handlerIds.includes(hid)) {
      return {
        ok: false,
        schema_version: SIDE_EFFECT_RULE_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
        action_name: an,
        handler_id: hid,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'handler_id validation failed',
          details: [{ field: 'handler_id', reason: 'unsupported handler_id' }],
        },
      };
    }
    if (!isSupportedActionHandlerPair(an, hid)) {
      return {
        ok: false,
        schema_version: SIDE_EFFECT_RULE_SCHEMA_VERSION,
        updated_at: new Date().toISOString(),
        action_name: an,
        handler_id: hid,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'action_name and handler_id pair validation failed',
          details: [{ field: 'action_name,handler_id', reason: 'unsupported action-handler pair' }],
        },
      };
    }
    return {
      ok: true,
      schema_version: SIDE_EFFECT_RULE_SCHEMA_VERSION,
      updated_at: new Date().toISOString(),
      action_name: an,
      handler_id: hid,
      schema: getParamsSchemaForActionHandler(an, hid),
    };
  }

  @Get('decision-rules/side-effect-params/rules/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get one SideEffect rule row by id' })
  @ApiResponse({ status: 200, description: 'Rule row (or null if not found)' })
  async getSideEffectRuleById(
    @Param('id') id: string,
  ): Promise<{ ok: boolean; rule: { id: string; action_name: string; handler_id: string; params: Record<string, any>; is_active: boolean; updated_at: string } | null }> {
    if (!this.sideEffectRuleSyncer) {
      return { ok: false, rule: null };
    }
    const r = await this.sideEffectRuleSyncer.getRuleById(String(id));
    if (!r) return { ok: true, rule: null };
    return {
      ok: true,
      rule: {
        id: String(r.id),
        action_name: String(r.actionName),
        handler_id: String(r.handlerId),
        params: (r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {}) as any,
        is_active: Boolean(r.isActive),
        updated_at: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : new Date(String(r.updatedAt)).toISOString(),
      },
    };
  }

  @Post('decision-rules/side-effect-params/rules')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create/update (upsert) one SideEffect rule row (exact params)' })
  @ApiBody({ type: SideEffectRuleUpsertBodyDto })
  async upsertSideEffectRule(
    @Body() body: SideEffectRuleUpsertBodyDto,
  ): Promise<{
    ok: boolean;
    rule?: { id: string; action_name: string; handler_id: string; params: Record<string, any>; updated_at: string };
    message?: string;
    error?: {
      code: 'VALIDATION_ERROR';
      message: string;
      details: Array<{ field: string; reason: string }>;
    };
  }> {
    if (!this.sideEffectRuleSyncer) {
      return { ok: false, message: 'SideEffectRuleSyncerService not available (database or module)' };
    }
    const dict = await this.buildRuleMetaDictionary();
    const details: Array<{ field: string; reason: string }> = [];
    if (!dict.actionNames.includes(String(body.action_name))) {
      details.push({ field: 'action_name', reason: 'unsupported action_name' });
    }
    if (!dict.handlerIds.includes(String(body.handler_id))) {
      details.push({ field: 'handler_id', reason: 'unsupported handler_id' });
    }
    if (
      dict.actionNames.includes(String(body.action_name)) &&
      dict.handlerIds.includes(String(body.handler_id)) &&
      !isSupportedActionHandlerPair(String(body.action_name), String(body.handler_id))
    ) {
      details.push({ field: 'action_name,handler_id', reason: 'unsupported action-handler pair' });
    }
    const params = body.params ?? {};
    const paramCheck = assertSideEffectParamsForHandler(String(body.handler_id), params);
    if (paramCheck.ok === false) {
      details.push({ field: 'params', reason: paramCheck.message });
    }
    if (details.length > 0) {
      return {
        ok: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'params validation failed',
          details,
        },
        message: 'params validation failed',
      };
    }
    const row = await this.sideEffectRuleSyncer.upsertRuleExact(body.action_name, body.handler_id, params as any);
    return {
      ok: true,
      rule: {
        id: String(row.id),
        action_name: String(row.actionName),
        handler_id: String(row.handlerId),
        params: (row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? (row.params as any) : {}) as any,
        updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(String(row.updatedAt)).toISOString(),
      },
    };
  }

  @Delete('decision-rules/side-effect-params/rules/:id')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft delete one SideEffect rule row (set isActive=false)' })
  async deleteSideEffectRule(
    @Param('id') id: string,
  ): Promise<{ ok: boolean; deleted: boolean; message?: string }> {
    if (!this.sideEffectRuleSyncer) {
      return { ok: false, deleted: false, message: 'SideEffectRuleSyncerService not available (database or module)' };
    }
    const r = await this.sideEffectRuleSyncer.deactivateRuleById(String(id));
    return { ok: true, deleted: r.found };
  }

  @Post('decision-rules/hard-truth-rules')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upsert a global hard-truth rule row (DecisionRuleConfig)' })
  @ApiBody({ type: HardTruthRuleUpsertBodyDto })
  async upsertHardTruthRule(
    @Body() body: HardTruthRuleUpsertBodyDto,
  ): Promise<{ ok: boolean; rule?: { rule_kind: 'hard_truth'; id: string; rule_key: string; params: Record<string, any>; updated_at: string }; message?: string }> {
    if (!this.sideEffectRuleSyncer) {
      return { ok: false, message: 'SideEffectRuleSyncerService not available (database or module)' };
    }
    try {
      const params = validateHardTruthRuleParams(body.rule_key, body.params ?? {});
      const row = await this.sideEffectRuleSyncer.upsertRuleExact(HARD_TRUTH_GLOBAL_ACTION, body.rule_key, params);
      return {
        ok: true,
        rule: {
          rule_kind: 'hard_truth',
          id: String(row.id),
          rule_key: String(row.handlerId),
          params: (row.params && typeof row.params === 'object' && !Array.isArray(row.params) ? (row.params as any) : {}) as any,
          updated_at: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : new Date(String(row.updatedAt)).toISOString(),
        },
      };
    } catch (e: any) {
      return { ok: false, message: e?.message ?? String(e) };
    }
  }

  @Post('decision-rules/side-effect-params/patch')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Apply SideEffect param patches (memory and/or Prisma)',
    description:
      'Default: merge into in-memory resolver only. With persist_to_db=true, all patches run in a single Prisma $transaction, then memory is synced in one resolver bump.',
  })
  @ApiBody({ type: SideEffectParamPatchesBodyDto })
  async patchSideEffectParamOverrides(
    @Body() body: SideEffectParamPatchesBodyDto,
  ): Promise<{
    ok: boolean;
    revision: number;
    source?: 'memory' | 'db';
    results?: Array<{ action_name: string; handler_id: string; merged: Record<string, any> | null; deactivated: boolean }>;
    message?: string;
  }> {
    if (!this.sideEffectParamResolver) {
      return { ok: false, revision: 0, message: 'SideEffectParamResolverService not available' };
    }
    const list = (body.patches ?? []).filter((p) => p.params !== undefined);
    if (list.length === 0) {
      return { ok: false, revision: this.sideEffectParamResolver.getRevision(), message: 'No patches (params required per row)' };
    }
    if (body.persist_to_db) {
      if (!this.sideEffectRuleSyncer) {
        return {
          ok: false,
          revision: this.sideEffectParamResolver.getRevision(),
          message: 'SideEffectRuleSyncerService not available (database or module)',
        };
      }
      try {
        const results = await this.sideEffectRuleSyncer.persistPatchBatch(
          list.map((p) => ({
            action_name: p.action_name,
            handler_id: p.handler_id,
            params: p.params as Record<string, any> | null,
          })),
        );
        return {
          ok: true,
          revision: this.sideEffectParamResolver.getRevision(),
          source: 'db',
          results,
        };
      } catch (e: any) {
        return {
          ok: false,
          revision: this.sideEffectParamResolver.getRevision(),
          message: e?.message ?? String(e),
        };
      }
    }
    this.sideEffectParamResolver.applyPatches(
      list.map((p) => ({
        action_name: p.action_name,
        handler_id: p.handler_id,
        params: p.params as Record<string, any> | null,
      })),
    );
    return { ok: true, revision: this.sideEffectParamResolver.getRevision(), source: 'memory' };
  }

  @Post('decision-rules/side-effect-params/replace')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Replace entire SideEffect override map (memory and/or Prisma)',
    description:
      'Default: replace in-memory resolver only. With persist_to_db=true, upserts DecisionRuleConfig rows and reloads from DB.',
  })
  @ApiBody({ type: SideEffectParamReplaceBodyDto })
  async replaceSideEffectParamOverrides(
    @Body() body: SideEffectParamReplaceBodyDto,
  ): Promise<{
    ok: boolean;
    revision: number;
    source?: 'memory' | 'db';
    upserted?: number;
    deactivated?: number;
    message?: string;
  }> {
    if (!this.sideEffectParamResolver) {
      return { ok: false, revision: 0, message: 'SideEffectParamResolverService not available' };
    }
    if (body.persist_to_db) {
      if (!this.sideEffectRuleSyncer) {
        return {
          ok: false,
          revision: this.sideEffectParamResolver.getRevision(),
          message: 'SideEffectRuleSyncerService not available (database or module)',
        };
      }
      try {
        const { upserted, deactivated } = await this.sideEffectRuleSyncer.persistFullReplace(
          body.overrides ?? {},
          { deactivateUnlisted: Boolean(body.deactivate_unlisted) },
        );
        return {
          ok: true,
          revision: this.sideEffectParamResolver.getRevision(),
          source: 'db',
          upserted,
          deactivated,
        };
      } catch (e: any) {
        return {
          ok: false,
          revision: this.sideEffectParamResolver.getRevision(),
          message: e?.message ?? String(e),
        };
      }
    }
    this.sideEffectParamResolver.replaceAll(body.overrides ?? {});
    return { ok: true, revision: this.sideEffectParamResolver.getRevision(), source: 'memory' };
  }

  @Post('decision-rules/side-effect-params/sync-from-db')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reload active DecisionRuleConfig rows into the in-memory resolver' })
  async syncSideEffectParamsFromDb(): Promise<{
    ok: boolean;
    activeCount?: number;
    maxUpdatedAt?: string | null;
    revision: number;
    message?: string;
  }> {
    if (!this.sideEffectParamResolver) {
      return { ok: false, revision: 0, message: 'SideEffectParamResolverService not available' };
    }
    if (!this.sideEffectRuleSyncer) {
      return {
        ok: false,
        revision: this.sideEffectParamResolver.getRevision(),
        message: 'SideEffectRuleSyncerService not available',
      };
    }
    const r = await this.sideEffectRuleSyncer.syncFromDb();
    if (!r.ok) {
      return {
        ok: false,
        revision: r.revision,
        message: 'Database not connected',
      };
    }
    return {
      ok: true,
      activeCount: r.activeCount,
      maxUpdatedAt: r.maxUpdatedAt,
      revision: r.revision,
    };
  }
}
