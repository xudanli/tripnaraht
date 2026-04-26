import { Body, Controller, Inject, HttpCode, HttpStatus, Optional, Post, Get, Query, Param, Delete } from '@nestjs/common';
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
import { FinancialHoldStoreService } from './services/financial-hold-store.service';
import { SideEffectParamResolverService } from './services/side-effect-param-resolver.service';
import { SideEffectRuleSyncerService } from './services/side-effect-rule-syncer.service';
import {
  SideEffectParamPatchesBodyDto,
  SideEffectParamReplaceBodyDto,
} from './dto/side-effect-param-override.dto';
import { SideEffectRuleUpsertBodyDto } from './dto/side-effect-rule-row.dto';
import { HardTruthRuleUpsertBodyDto } from './dto/hard-truth-rule-row.dto';
import { validateHardTruthRuleParams } from './dto/hard-truth-rule.validation';
import { HARD_TRUTH_GLOBAL_ACTION } from './constants/hard-truth-rule.constants';
import type { IDsoFeedbackPersistence } from '../decision/kernel/dso-feedback-persistence.interface';
import { DSO_FEEDBACK_PERSISTENCE } from '../decision/kernel/dso-feedback-persistence.interface';
import type { DecisionState } from '../decision/kernel/decision-state.types';
import { projectJepaZStateFromDecisionState } from './services/jepa-z-state.projection';

@ApiTags('agent-actions')
@ApiBearerAuth()
@ApiExtraModels(FinancialHoldSideEffectParamsDto)
@Controller('agent/actions')
export class ActionsController {
  constructor(
    private readonly actionExecutionService: ActionExecutionService,
    @Optional() private readonly financialHoldStore?: FinancialHoldStoreService,
    @Optional() private readonly sideEffectParamResolver?: SideEffectParamResolverService,
    @Optional() private readonly sideEffectRuleSyncer?: SideEffectRuleSyncerService,
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
  ): Promise<{ ok: boolean; rule?: { id: string; action_name: string; handler_id: string; params: Record<string, any>; updated_at: string }; message?: string }> {
    if (!this.sideEffectRuleSyncer) {
      return { ok: false, message: 'SideEffectRuleSyncerService not available (database or module)' };
    }
    const params = body.params ?? {};
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
