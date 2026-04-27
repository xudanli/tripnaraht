import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { AdminStrictAuthGuard } from '../guards/admin-strict-auth.guard';
import { SideEffectRuleSyncerService } from '../../agent/services/side-effect-rule-syncer.service';
import { AgentActionLogService } from '../../agent/services/agent-action-log.service';
import { SideEffectRegistryService } from '../../agent/services/side-effect-registry.service';
import { ActionExecutionService } from '../../agent/services/action-execution.service';
import { ActionRegistryService } from '../../agent/services/action-registry.service';
import { FinancialHoldStoreService } from '../../agent/services/financial-hold-store.service';
import { HardTruthRuleResolverService } from '../../agent/services/hard-truth-rule-resolver.service';
import { AdminActivityLogService } from '../services/admin-activity-log.service';
import { SagaSideEffectReplayService } from '../services/saga-side-effect-replay.service';
import { AdminQualityMarkService } from '../services/admin-quality-mark.service';
import { AutoDriftSamplerService } from '../services/auto-drift-sampler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ActionPreviewRequestDto } from '../../agent/dto/action-execution.dto';
import { HARD_TRUTH_GLOBAL_ACTION, HARD_TRUTH_HANDLER_PREFIX } from '../../agent/constants/hard-truth-rule.constants';
import { normalizeHardRuleSnapshot, type HardRuleFact } from '../../trips/decision/shared/hard-rule-snapshot.types';
import { deriveFactsFromMetadata } from '../../trips/decision/shared/fact-derivation.util';
import { buildToleranceResolver, COMPARE_METRICS, metricForRuleId } from '../utils/decision-contract-compare.util';
import {
  AdminRulePatchDto,
  AdminRulesBatchReplaceDto,
  AdminRulesListQueryDto,
  AdminSagaLogsQueryDto,
  AdminSagaRetryDto,
} from '../dto/agent-ops-admin.dto';
import { AdminQualityMarkCreateDto, AdminQualityMarkListQueryDto, AdminQualityMarkUpdateDto } from '../dto/admin-quality.dto';

type AdminDecisionContractComparePerRuleStatus =
  | 'PASS'
  | 'DRIFT'
  | 'MISSING_CURRENT'
  | 'MISSING_EXPECTED'
  | 'UNCOMPARABLE';

type AdminDecisionContractCompareResponse = {
  ok: boolean;
  message?: string;
  saga_log_id?: string;
  action_id?: string;
  expected?: {
    expected_state_delta: any | null;
    feasibility_snapshot: any | null;
    physics_facts: HardRuleFact[];
  };
  realized?: {
    hold: any | null;
  };
  variance?: any;
  physics?: {
    expected: any | null;
    current: any | null;
    variance: null | {
      status: 'PASS' | 'DRIFT';
      per_rule: Array<{
        rule_id: string;
        metric: string | null;
        unit: string;
        expected_actual: number | null;
        current_actual: number | null;
        abs_delta: number | null;
        tolerance: number | null;
        status: AdminDecisionContractComparePerRuleStatus;
      }>;
      drift_count: number;
      expected_feasible: boolean | null;
      current_feasible: boolean;
      expected_hard_violation_count: number | null;
      current_hard_violation_count: number;
    };
  };
};

@ApiTags('Admin — Policy, Saga, Holds, Simulation')
@Controller('admin')
@Public()
@UseGuards(AdminStrictAuthGuard)
@ApiBearerAuth()
@ApiHeader({ name: 'x-admin-god-key', required: false, description: 'Optional when ADMIN_GOD_API_KEY is set (Bearer value alternative)' })
export class AgentOpsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleSyncer: SideEffectRuleSyncerService,
    private readonly agentActionLog: AgentActionLogService,
    private readonly sideEffectRegistry: SideEffectRegistryService,
    private readonly actionExecution: ActionExecutionService,
    private readonly actionRegistry: ActionRegistryService,
    private readonly financialHolds: FinancialHoldStoreService,
    private readonly hardTruthRules: HardTruthRuleResolverService,
    private readonly adminAudit: AdminActivityLogService,
    private readonly qualityMarks: AdminQualityMarkService,
    private readonly autoSampler: AutoDriftSamplerService,
    private readonly sagaReplay: SagaSideEffectReplayService,
  ) {}

  private actor(req: Request): string {
    const u = (req as any).user;
    return String(u?.userId ?? u?.email ?? 'unknown');
  }

  @Get('rules')
  @ApiOperation({ summary: 'List DecisionRuleConfig rows (paginated, optional filters)' })
  async listRules(@Query() q: AdminRulesListQueryDto) {
    const take = Math.min(200, Math.max(1, Number(q.take ?? 50)));
    const skip = Math.max(0, Number(q.skip ?? 0));
    return this.ruleSyncer.listRulesForAdmin({
      actionNameContains: q.actionName,
      handlerIdContains: q.handlerId,
      active: q.active ?? 'all',
      take,
      skip,
    });
  }

  @Get('rules/effective')
  @ApiOperation({ summary: '3-tier merged effective rules (code base + runtime overrides + DB metadata)' })
  async effectiveRules() {
    return this.ruleSyncer.getEffectiveRulesForAdmin();
  }

  @Post('rules/patch')
  @ApiOperation({ summary: 'Patch params and/or is_active for one rule (DB + in-memory sync)' })
  async patchRule(@Body() dto: AdminRulePatchDto, @Req() req: Request) {
    const an = String(dto.action_name ?? '').trim();
    const hid = String(dto.handler_id ?? '').trim();
    let beforeParams: unknown = null;
    if (dto.params !== undefined && this.prisma.isDbConnected()) {
      try {
        const row = await this.prisma.decisionRuleConfig.findUnique({
          where: { actionName_handlerId: { actionName: an, handlerId: hid } },
        });
        beforeParams = row?.params ?? null;
      } catch {
        beforeParams = null;
      }
    }
    try {
      const result = await this.ruleSyncer.persistAdminRulePatch({
        action_name: an,
        handler_id: hid,
        params: dto.params === undefined ? undefined : dto.params,
        is_active: dto.is_active,
      });
      await this.adminAudit.record({
        actor: this.actor(req),
        path: '/api/admin/rules/patch',
        method: 'POST',
        meta: {
          action_name: an,
          handler_id: hid,
          before_params: beforeParams,
          after_merged: result.merged,
          is_active: dto.is_active,
        },
      });
      return { ok: true, ...result };
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? String(e));
    }
  }

  @Post('rules/batch-replace')
  @ApiOperation({ summary: 'Import a full rule pack (transactional persist + sync)' })
  async batchReplace(@Body() dto: AdminRulesBatchReplaceDto, @Req() req: Request) {
    try {
      const { upserted, deactivated } = await this.ruleSyncer.persistFullReplace(dto.pack ?? {}, {
        deactivateUnlisted: dto.deactivate_unlisted !== false,
      });
      await this.adminAudit.record({
        actor: this.actor(req),
        path: '/api/admin/rules/batch-replace',
        method: 'POST',
        meta: { upserted, deactivated, deactivate_unlisted: dto.deactivate_unlisted !== false },
      });
      return { ok: true, upserted, deactivated };
    } catch (e: any) {
      throw new BadRequestException(e?.message ?? String(e));
    }
  }

  @Get('saga/logs')
  @ApiOperation({ summary: 'Paginated AgentActionLog list' })
  async sagaLogs(@Query() q: AdminSagaLogsQueryDto) {
    const take = Math.min(200, Math.max(1, Number(q.take ?? 50)));
    const skip = Math.max(0, Number(q.skip ?? 0));
    const r = await this.agentActionLog.listPaginated({
      status: q.status,
      tripId: q.tripId,
      take,
      skip,
    });
    return {
      ...r,
      enabled: this.agentActionLog.isEnabled(),
      db_connected: this.prisma.isDbConnected(),
    };
  }

  @Get('saga/logs/:id')
  @ApiOperation({ summary: 'Saga log detail (payload + lastError)' })
  async sagaLogDetail(@Param('id') id: string) {
    const row = await this.agentActionLog.findById(id);
    if (!row) return { ok: false, message: 'Not found' };
    return { ok: true, log: row };
  }

  @Get('saga/logs/:id/decision-contract')
  @ApiOperation({ summary: 'DecisionContract view for one saga log' })
  @ApiParam({ name: 'id', description: 'AgentActionLog id (saga log id)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },
        message: { type: 'string', nullable: true },
        id: { type: 'string' },
        decision_contract: { type: 'object', nullable: true },
        realized_state: { type: 'object', nullable: true },
        compare_path: { type: 'string' },
        evidence_links: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              decision_log_id: { type: 'string' },
              qa_pair_path: { type: 'string' },
            },
          },
        },
      },
    },
  })
  async sagaDecisionContract(@Param('id') id: string) {
    const row = await this.agentActionLog.findById(id);
    if (!row) return { ok: false, message: 'Not found' };
    const payload = row.payload && typeof row.payload === 'object' ? (row.payload as any) : {};
    const dc = payload.decision_contract ?? null;
    const refs: string[] = Array.isArray(dc?.evidence_refs) ? dc.evidence_refs.map((x: any) => String(x)) : [];
    return {
      ok: true,
      id: row.id,
      decision_contract: dc,
      realized_state: payload.realized_state ?? null,
      compare_path: `/api/admin/saga/logs/${row.id}/decision-contract/compare`,
      evidence_links: refs.map((rid) => ({
        decision_log_id: rid,
        qa_pair_path: `/api/decision/admin/logs/${rid}/qa-pair`,
      })),
    };
  }

  @Get('saga/logs/:id/decision-contract/compare')
  @ApiOperation({ summary: 'Compare DecisionContract expected vs realized (resources + physics/human factors v1)' })
  @ApiParam({ name: 'id', description: 'AgentActionLog id (saga log id)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['ok'],
      properties: {
        ok: { type: 'boolean' },
        message: { type: 'string', nullable: true },
        saga_log_id: { type: 'string' },
        action_id: { type: 'string' },
        expected: {
          type: 'object',
          properties: {
            expected_state_delta: { type: 'object', nullable: true },
            feasibility_snapshot: { type: 'object', nullable: true },
            physics_facts: { type: 'array', items: { type: 'object' } },
          },
        },
        realized: {
          type: 'object',
          properties: {
            hold: { type: 'object', nullable: true },
          },
        },
        variance: { type: 'object' },
        physics: {
          type: 'object',
          properties: {
            expected: { type: 'object', nullable: true },
            current: { type: 'object', nullable: true },
            variance: {
              type: 'object',
              nullable: true,
              properties: {
                status: { type: 'string', enum: ['PASS', 'DRIFT'] },
                drift_count: { type: 'number' },
                expected_feasible: { type: 'boolean', nullable: true },
                current_feasible: { type: 'boolean' },
                expected_hard_violation_count: { type: 'number', nullable: true },
                current_hard_violation_count: { type: 'number' },
                per_rule: {
                  type: 'array',
                  items: {
                    type: 'object',
                    required: ['rule_id', 'status'],
                    properties: {
                      rule_id: { type: 'string' },
                      metric: { type: 'string', nullable: true, enum: COMPARE_METRICS as unknown as string[] },
                      unit: { type: 'string' },
                      expected_actual: { type: 'number', nullable: true },
                      current_actual: { type: 'number', nullable: true },
                      abs_delta: { type: 'number', nullable: true },
                      tolerance: { type: 'number', nullable: true },
                      status: {
                        type: 'string',
                        enum: ['PASS', 'DRIFT', 'MISSING_CURRENT', 'MISSING_EXPECTED', 'UNCOMPARABLE'],
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async sagaDecisionContractCompare(@Param('id') id: string, @Req() req: Request): Promise<AdminDecisionContractCompareResponse> {
    const row = await this.agentActionLog.findById(id);
    if (!row) return { ok: false, message: 'Not found' };
    const payload = row.payload && typeof row.payload === 'object' ? (row.payload as any) : {};
    const dc = payload.decision_contract ?? null;
    if (!dc) return { ok: false, message: 'No decision_contract on saga payload' };

    const action_id = String(row.actionId ?? '');
    const hold_id = `hold_${action_id}`;

    // Realized: prefer DB row by hold_id (includes expired/history), then fallback to active view.
    let realizedHold: any | null = null;
    // Prefer realized_state written to saga payload (settlement receipt).
    const realizedFromPayload = Array.isArray(payload?.realized_state?.holds)
      ? payload.realized_state.holds.find((h: any) => String(h?.hold_id ?? '') === hold_id)
      : null;
    if (realizedFromPayload) {
      realizedHold = { ...realizedFromPayload, source: 'saga_payload' };
    }
    if (this.prisma.isDbConnected()) {
      try {
        const db = await this.prisma.agentFinancialHold.findUnique({
          where: { holdId: hold_id },
        });
        if (db) {
          realizedHold = realizedHold ?? {
            hold_id: db.holdId,
            action_id: db.actionId,
            action_name: db.actionName,
            trip_id: db.tripId,
            request_id: db.requestId,
            amount: db.amount ?? null,
            currency: db.currency ?? null,
            expires_at: db.expiresAt.toISOString(),
            created_at: db.createdAt.toISOString(),
            is_expired: db.expiresAt.getTime() <= Date.now(),
            source: 'db',
          };
        }
      } catch {
        // ignore, fallback to active list
      }
    }
    if (!realizedHold) {
      const holds = await this.financialHolds.listAllActiveHolds();
      const active = holds.find((h) => String(h.hold_id) === hold_id) ?? null;
      realizedHold = active ? { ...active, source: 'active' } : null;
    }

    const expectedDeltas = Array.isArray(dc?.expected_state_delta?.deltas) ? dc.expected_state_delta.deltas : [];
    const expectedHoldDelta = expectedDeltas.find((d: any) => d?.path === '$.budget.locked' && d?.op === 'inc');
    const expected_amount = typeof expectedHoldDelta?.value === 'number' ? expectedHoldDelta.value : null;
    const expected_currency = typeof expectedHoldDelta?.unit === 'string' ? expectedHoldDelta.unit : null;

    const realized_amount = realizedHold && typeof realizedHold.amount === 'number' ? realizedHold.amount : null;
    const realized_currency = realizedHold && typeof realizedHold.currency === 'string' ? realizedHold.currency : null;

    // Variance status (v1): abs delta <= allowed_variance for budget.hold_amount (default=1)
    const av = Array.isArray(dc?.allowed_variance) ? dc.allowed_variance : [];
    const moneyRule = av.find((r: any) => r?.metric === 'budget.hold_amount' && r?.op === 'abs_delta_lte');
    const tol = typeof moneyRule?.threshold === 'number' ? moneyRule.threshold : 1;
    const abs_delta =
      expected_amount != null && realized_amount != null ? Math.abs(expected_amount - realized_amount) : null;
    const pass =
      abs_delta != null ? abs_delta <= tol : false;

    // Physics variance (v1): compare stored physics_facts vs current facts snapshot from decision_logs.
    let physics_current: any | null = null;
    let physics_variance: any | null = null;
    const tripId = String(row.tripId ?? '');
    const physics_expected = dc?.semantic_signature?.feasibility_snapshot ?? null;
    const expectedFacts: HardRuleFact[] = Array.isArray(dc?.physics_facts) ? (dc.physics_facts as any) : [];
    if (tripId && this.prisma.isDbConnected()) {
      try {
        const since = new Date(Date.now() - 90 * 60 * 1000);
        const rows = await this.prisma.decisionLog.findMany({
          where: { tripId, timestamp: { gte: since } },
          orderBy: { timestamp: 'desc' },
          take: 80,
          select: { id: true, timestamp: true, reasonCodes: true, metadata: true },
        });
        const facts: HardRuleFact[] = [];
        for (const r of rows) {
          const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as any) : {};
          const snap = normalizeHardRuleSnapshot(meta).assertions_triggered;
          if (snap.length > 0) {
            facts.push(...snap);
          } else {
            const derived = deriveFactsFromMetadata({
              metadata: meta,
              reasonCodes: Array.isArray(r.reasonCodes) ? r.reasonCodes : [],
              timestampIso: r.timestamp?.toISOString?.(),
            });
            if (derived.length > 0) facts.push(...derived);
          }
        }
        const hardViolated = facts.filter((f) => String(f.severity ?? 'HARD').toUpperCase() === 'HARD' && f.is_violated);
        physics_current = {
          feasible: hardViolated.length === 0,
          hard_violation_count: hardViolated.length,
          violated_rules: hardViolated.map((f) => ({ rule_id: f.rule_id, severity: 'HARD' })),
          evidence_refs: rows.map((r) => String(r.id)),
          facts: facts.slice(0, 50),
        };
        const byRule = new Map(facts.map((f) => [String(f.rule_id), f]));
        const av = Array.isArray(dc?.allowed_variance) ? dc.allowed_variance : [];
        const { tolForMetric } = buildToleranceResolver(av as any[]);

        const per_rule: any[] = [];
        let driftCount = 0;
        const seenExpected = new Set<string>();
        for (const ef of expectedFacts) {
          const rid = String((ef as any)?.rule_id ?? '').trim();
          if (!rid) continue;
          seenExpected.add(rid);
          const cf = byRule.get(rid);
          if (!cf) {
            driftCount++;
            const unitLower = String((ef as any)?.unit ?? '').toLowerCase();
            const metric = metricForRuleId({ rule_id: rid, unit: unitLower });
            per_rule.push({
              rule_id: rid,
              metric,
              unit: unitLower,
              expected_actual: (ef as any)?.actual_value ?? null,
              current_actual: null,
              abs_delta: null,
              tolerance: tolForMetric(metric),
              status: 'MISSING_CURRENT',
            });
            continue;
          }
          const ea = (ef as any)?.actual_value;
          const ca = (cf as any)?.actual_value;
          if (typeof ea !== 'number' || typeof ca !== 'number') {
            driftCount++;
            const unitLower = String((ef as any)?.unit ?? (cf as any)?.unit ?? '').toLowerCase();
            const metric = metricForRuleId({ rule_id: rid, unit: unitLower });
            per_rule.push({
              rule_id: rid,
              metric,
              unit: unitLower,
              expected_actual: ea ?? null,
              current_actual: ca ?? null,
              abs_delta: null,
              tolerance: tolForMetric(metric),
              status: 'UNCOMPARABLE',
            });
            continue;
          }
          const unit = String((ef as any)?.unit ?? (cf as any)?.unit ?? '').toLowerCase();
          const metric = metricForRuleId({ rule_id: rid, unit });
          const tol = tolForMetric(metric);
          const abs = Math.abs(ea - ca);
          const ok = tol == null ? true : abs <= tol;
          if (!ok) driftCount++;
          per_rule.push({
            rule_id: rid,
            metric,
            unit,
            expected_actual: ea,
            current_actual: ca,
            abs_delta: abs,
            tolerance: tol,
            status: ok ? 'PASS' : 'DRIFT',
          });
        }

        // Add current-only facts so UI can debug "why contract had nothing".
        for (const [rid, cf] of byRule.entries()) {
          if (seenExpected.has(rid)) continue;
          const ca = (cf as any)?.actual_value;
          if (typeof ca !== 'number') continue;
          const unitLower = String((cf as any)?.unit ?? '').toLowerCase();
          const metric = metricForRuleId({ rule_id: rid, unit: unitLower });
          per_rule.push({
            rule_id: rid,
            metric,
            unit: unitLower,
            expected_actual: null,
            current_actual: ca,
            abs_delta: null,
            tolerance: tolForMetric(metric),
            status: 'MISSING_EXPECTED',
          });
        }

        // Also keep coarse feasibility variance for quick UI status.
        const expectedFeasible = physics_expected && typeof physics_expected === 'object' ? Boolean((physics_expected as any).feasible) : null;
        const currentFeasible = Boolean(physics_current.feasible);
        physics_variance = {
          status: driftCount > 0 ? 'DRIFT' : 'PASS',
          per_rule,
          drift_count: driftCount,
          expected_feasible: expectedFeasible,
          current_feasible: currentFeasible,
          expected_hard_violation_count: physics_expected && typeof physics_expected === 'object' ? (Number((physics_expected as any).hard_violation_count ?? 0) || 0) : null,
          current_hard_violation_count: Number(physics_current.hard_violation_count ?? 0) || 0,
        };
      } catch {
        physics_current = null;
        physics_variance = null;
      }
    }

    const out = {
      ok: true,
      saga_log_id: row.id,
      action_id,
      expected: {
        expected_state_delta: dc.expected_state_delta ?? null,
        feasibility_snapshot: dc?.semantic_signature?.feasibility_snapshot ?? null,
        physics_facts: expectedFacts.slice(0, 50),
      },
      realized: {
        hold: realizedHold,
      },
      variance: {
        status: pass ? 'PASS' : 'DRIFT',
        metric: 'budget.hold_amount',
        expected_amount,
        expected_currency,
        realized_amount,
        realized_currency,
        abs_delta,
        tolerance: tol,
      },
      physics: {
        expected: physics_expected,
        current: physics_current,
        variance: physics_variance,
      },
    };
    await this.adminAudit.record({
      actor: this.actor(req),
      path: `/api/admin/saga/logs/${id}/decision-contract/compare`,
      method: 'GET',
      meta: {
        saga_log_id: row.id,
        variance_status: out.variance.status,
        physics_status: out.physics?.variance?.status ?? null,
      },
    });
    return out;
  }

  @Post('saga/retry/:id')
  @ApiOperation({ summary: 'Replay SideEffectRegistry.applyMany for COMMITTED/FAILED logs (idempotent per log id)' })
  async sagaRetry(
    @Param('id') id: string,
    @Body() body: AdminSagaRetryDto,
    @Headers('idempotency-key') idemHeader: string | undefined,
    @Req() req: Request,
  ) {
    const idem = (body?.idempotency_key ?? idemHeader ?? '').trim() || null;
    const r = await this.sagaReplay.replaySideEffects({ agentActionLogId: id, idempotencyKey: idem });
    if (r.ok === false) {
      if (r.code === 'NOT_FOUND') throw new NotFoundException(r.message);
      throw new BadRequestException({ code: r.code, message: r.message });
    }
    await this.adminAudit.record({
      actor: this.actor(req),
      path: `/api/admin/saga/retry/${id}`,
      method: 'POST',
      meta: { agent_action_log_id: id, idempotency_key: idem, already_replayed: r.already_replayed },
    });
    return r;
  }

  @Get('holds/active')
  @ApiOperation({ summary: 'Non-expired AgentFinancialHold rows (amount not persisted in DB today)' })
  async activeHolds() {
    const holds = await this.financialHolds.listAllActiveHolds();
    return { ok: true, holds };
  }

  @Get('holds/summary')
  @ApiOperation({ summary: 'Shadow locked balance summary from active holds' })
  async holdsSummary() {
    const holds = await this.financialHolds.listAllActiveHolds();
    const byCurrency: Record<string, { currency: string; total_amount: number; count: number }> = {};
    for (const h of holds) {
      const c = String(h.currency ?? 'UNKNOWN');
      const amt = typeof h.amount === 'number' && Number.isFinite(h.amount) ? h.amount : 0;
      if (!byCurrency[c]) byCurrency[c] = { currency: c, total_amount: 0, count: 0 };
      byCurrency[c].total_amount += amt;
      byCurrency[c].count += 1;
    }
    return {
      ok: true,
      total_holds: holds.length,
      by_currency: Object.values(byCurrency).sort((a, b) => a.currency.localeCompare(b.currency)),
    };
  }

  @Delete('holds/:holdId')
  @ApiOperation({ summary: 'Force-release a hold token' })
  async deleteHold(@Param('holdId') holdId: string, @Req() req: Request) {
    const ok = await this.financialHolds.expire(holdId);
    await this.adminAudit.record({
      actor: this.actor(req),
      path: `/api/admin/holds/${holdId}`,
      method: 'DELETE',
      meta: { hold_id: holdId, deleted: ok },
    });
    return { ok, hold_id: holdId };
  }

  @Get('ontology/actions')
  @ApiOperation({ summary: 'Static ActionRegistry contracts (side_effect_configs, metadata, schemas)' })
  ontologyActions() {
    const actions = this.actionRegistry.list().map((a) => ({
      name: a.name,
      description: a.description,
      metadata: a.metadata,
      side_effect_configs: a.side_effect_configs ?? [],
      input_schema: a.input_schema,
      output_schema: a.output_schema,
    }));
    const side_effect_handlers = this.sideEffectRegistry.list().map((h) => ({
      id: h.id,
      kind: h.kind,
      evidenceRequired: h.evidenceRequired,
    }));
    return { ok: true, actions, side_effect_handlers };
  }

  @Get('ontology/assertions')
  @ApiOperation({ summary: 'Hard assertions export (hard-truth snapshot + DB rows)' })
  async ontologyAssertions() {
    await this.hardTruthRules.refreshFromDbIfStale(0);
    const snapshot = this.hardTruthRules.getSnapshot();
    let rows: Array<{ id: string; rule_key: string; is_active: boolean; params: any; updated_at: string }> = [];
    if (this.prisma.isDbConnected()) {
      const db = await this.prisma.decisionRuleConfig.findMany({
        where: {
          actionName: HARD_TRUTH_GLOBAL_ACTION,
          handlerId: { startsWith: HARD_TRUTH_HANDLER_PREFIX },
        },
        orderBy: { updatedAt: 'desc' },
        take: 500,
      });
      rows = db.map((r) => ({
        id: String(r.id),
        rule_key: String(r.handlerId),
        is_active: Boolean(r.isActive),
        params: r.params && typeof r.params === 'object' && !Array.isArray(r.params) ? (r.params as any) : {},
        updated_at: r.updatedAt.toISOString(),
      }));
    }
    return { ok: true, snapshot, rows };
  }

  @Post('simulate/preview')
  @ApiOperation({ summary: 'Preview actions under current hot rule config (no commit)' })
  async simulatePreview(@Body() body: ActionPreviewRequestDto) {
    return this.actionExecution.preview(body);
  }

  @Post('quality/marks')
  @ApiOperation({ summary: 'Create a quality mark (e.g. DRIFT label) for training/audit' })
  async createQualityMark(@Body() dto: AdminQualityMarkCreateDto, @Req() req: Request) {
    const r = await this.qualityMarks.create({
      actor: this.actor(req),
      targetType: dto.target_type,
      targetId: dto.target_id,
      label: dto.label,
      comment: dto.comment ?? null,
      meta: dto.meta ?? null,
    });
    if (r.ok) {
      await this.adminAudit.record({
        actor: this.actor(req),
        path: '/api/admin/quality/marks',
        method: 'POST',
        meta: { ...dto },
      });
    }
    return r;
  }

  @Get('quality/marks')
  @ApiOperation({ summary: 'List quality marks (paginated)' })
  async listQualityMarks(@Query() q: AdminQualityMarkListQueryDto) {
    const take = Math.min(200, Math.max(1, Number(q.take ?? 50)));
    const skip = Math.max(0, Number(q.skip ?? 0));
    const autoSampled =
      q.auto_sampled === 'true' ? true : q.auto_sampled === 'false' ? false : undefined;
    return this.qualityMarks.list({
      take,
      skip,
      targetType: q.target_type,
      targetId: q.target_id,
      label: q.label,
      autoSampled,
    });
  }

  @Get('quality/marks/:id')
  @ApiOperation({ summary: 'Get one quality mark by id' })
  @ApiParam({ name: 'id', description: 'AdminQualityMark id (uuid)' })
  async getQualityMark(@Param('id') id: string) {
    const r = await this.qualityMarks.getById(String(id));
    if (r.ok) return r;
    throw new NotFoundException(r.message ?? 'Not found');
  }

  @Patch('quality/marks/:id')
  @ApiOperation({ summary: 'Update a quality mark (label/comment/meta)' })
  @ApiParam({ name: 'id', description: 'AdminQualityMark id (uuid)' })
  async updateQualityMark(@Param('id') id: string, @Body() dto: AdminQualityMarkUpdateDto, @Req() req: Request) {
    const before = await this.qualityMarks.getById(String(id));
    const r = await this.qualityMarks.update(String(id), {
      ...(dto.label !== undefined ? { label: dto.label } : {}),
      ...(dto.comment !== undefined ? { comment: dto.comment ?? null } : {}),
      ...(dto.meta !== undefined ? { meta: dto.meta ?? null } : {}),
    });
    if (r.ok) {
      await this.adminAudit.record({
        actor: this.actor(req),
        path: `/api/admin/quality/marks/${id}`,
        method: 'PATCH',
        meta: {
          before: before.ok ? (before as any).row : null,
          patch: dto,
        },
      });
    }
    return r;
  }

  @Post('quality/marks/scan')
  @ApiOperation({ summary: 'Run auto drift sampler once (manual trigger)' })
  async scanQualityMarks(
    @Body() body: { since?: string } | undefined,
    @Req() req: Request,
  ) {
    const r = await this.autoSampler.runOnce({ source: 'manual', forceSinceIso: body?.since });
    await this.adminAudit.record({
      actor: this.actor(req),
      path: `/api/admin/quality/marks/scan`,
      method: 'POST',
      meta: { ...r },
    });
    return r;
  }
}
