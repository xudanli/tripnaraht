// src/agent/services/side-effect-rule-syncer.service.ts
import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { Prisma, type DecisionRuleConfig } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SideEffectParamResolverService } from './side-effect-param-resolver.service';
import { HardTruthRuleResolverService } from './hard-truth-rule-resolver.service';
import { filterSideEffectDecisionRuleRows, isHardTruthDecisionRuleRow } from '../utils/decision-rule-config.util';
import { ActionRegistryService } from './action-registry.service';

/** Build resolver map from active DB rows */
export function decisionRuleRowsToOverrideMap(
  rows: Pick<DecisionRuleConfig, 'actionName' | 'handlerId' | 'params'>[],
): Record<string, Record<string, Record<string, any>>> {
  const out: Record<string, Record<string, Record<string, any>>> = {};
  for (const r of rows) {
    const an = String(r.actionName ?? '');
    const hid = String(r.handlerId ?? '');
    if (!an || !hid) continue;
    const p = r.params;
    if (!out[an]) out[an] = {};
    out[an][hid] = typeof p === 'object' && p !== null && !Array.isArray(p) ? { ...(p as Record<string, any>) } : {};
  }
  return out;
}

export type PersistPatchBatchItem = {
  action_name: string;
  handler_id: string;
  params: Record<string, any> | null;
};

export type PersistPatchResult = {
  action_name: string;
  handler_id: string;
  merged: Record<string, any> | null;
  deactivated: boolean;
};

@Injectable()
export class SideEffectRuleSyncerService implements OnModuleInit {
  private readonly logger = new Logger(SideEffectRuleSyncerService.name);
  /** Max(updatedAt) across all rows (active + inactive) for drift detection */
  private lastSeenGlobalMaxUpdatedAt: Date | null = null;
  /** Log migration hint at most once when `decision_rule_configs` is not migrated (P2021) */
  private decisionRuleTableMissingHintLogged = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: SideEffectParamResolverService,
    @Optional() private readonly actionRegistry?: ActionRegistryService,
    @Optional() private readonly hardTruthRules?: HardTruthRuleResolverService,
  ) {}

  /**
   * 3-tier merged view for admin UI:
   * - baseParams: from code (Action.side_effect_configs)
   * - overrideParams: from runtime resolver snapshot (DB active rows + optional overrides file)
   * - dbRow: latest persisted row (active or inactive), used for updatedAt + inactive visibility
   */
  async getEffectiveRulesForAdmin(): Promise<{
    revision: number;
    total: number;
    rows: Array<{
      actionName: string;
      handlerId: string;
      baseParams: Record<string, any>;
      overrideParams: Record<string, any> | null;
      effectiveParams: Record<string, any>;
      status: 'DEFAULT' | 'OVERRIDDEN' | 'INACTIVE_OVERRIDE' | 'FILE_OVERRIDE';
      updatedAt: string | null;
      isActiveInDb: boolean | null;
      source: 'code';
    }>;
  }> {
    const revision = this.resolver.getRevision();
    if (!this.actionRegistry) {
      return { revision, total: 0, rows: [] };
    }

    const actions = this.actionRegistry.list();
    const baseRows: Array<{ actionName: string; handlerId: string; baseParams: Record<string, any> }> = [];
    for (const a of actions) {
      const actionName = String(a?.name ?? '').trim();
      if (!actionName) continue;
      for (const c of a.side_effect_configs ?? []) {
        const handlerId = String((c as any)?.handlerId ?? '').trim();
        if (!handlerId) continue;
        const params = (c as any)?.params;
        const baseParams =
          params && typeof params === 'object' && params !== null && !Array.isArray(params) ? { ...(params as any) } : {};
        baseRows.push({ actionName, handlerId, baseParams });
      }
    }

    const snap = this.resolver.getSnapshot().overrides;
    const pairs = baseRows.map((r) => ({ actionName: r.actionName, handlerId: r.handlerId }));
    const dbByKey = new Map<
      string,
      Pick<DecisionRuleConfig, 'actionName' | 'handlerId' | 'params' | 'isActive' | 'updatedAt'>
    >();
    if (this.prisma.isDbConnected() && pairs.length > 0) {
      try {
        const or = pairs.slice(0, 2000).map((p) => ({ actionName: p.actionName, handlerId: p.handlerId }));
        const rows = await this.prisma.decisionRuleConfig.findMany({
          where: { OR: or as any },
          select: { actionName: true, handlerId: true, params: true, isActive: true, updatedAt: true },
        });
        for (const r of rows) {
          dbByKey.set(`${r.actionName}::${r.handlerId}`, r);
        }
      } catch (e: any) {
        if (this.isDecisionRuleModelMissingError(e)) {
          this.logMigrationHintOnce('DecisionRuleConfig getEffectiveRulesForAdmin');
        } else {
          this.logger.warn(`getEffectiveRulesForAdmin DB fetch failed: ${e?.message ?? e}`);
        }
      }
    }

    const out = baseRows.map((r) => {
      const overrideParams = snap?.[r.actionName]?.[r.handlerId]
        ? { ...snap[r.actionName][r.handlerId] }
        : null;
      const db = dbByKey.get(`${r.actionName}::${r.handlerId}`) ?? null;
      const dbParams =
        db?.params && typeof db.params === 'object' && db.params !== null && !Array.isArray(db.params)
          ? ({ ...(db.params as any) } as Record<string, any>)
          : null;
      const isActiveInDb = db ? Boolean(db.isActive) : null;

      // What is actually applied at runtime (resolver snapshot includes DB active rows and/or file overrides).
      const applied = overrideParams;
      const effectiveParams = { ...r.baseParams, ...(applied ?? {}) };

      const status: 'DEFAULT' | 'OVERRIDDEN' | 'INACTIVE_OVERRIDE' | 'FILE_OVERRIDE' = (() => {
        if (applied) {
          if (db && db.isActive) return 'OVERRIDDEN';
          return 'FILE_OVERRIDE';
        }
        if (db && !db.isActive) return 'INACTIVE_OVERRIDE';
        return 'DEFAULT';
      })();

      return {
        actionName: r.actionName,
        handlerId: r.handlerId,
        baseParams: r.baseParams,
        overrideParams: applied,
        effectiveParams,
        status,
        updatedAt: db?.updatedAt?.toISOString?.() ?? null,
        isActiveInDb,
        source: 'code' as const,
      };
    });

    return { revision, total: out.length, rows: out };
  }

  private isDecisionRuleModelMissingError(e: unknown): boolean {
    return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2021';
  }

  private logMigrationHintOnce(context: string): void {
    if (this.decisionRuleTableMissingHintLogged) {
      return;
    }
    this.decisionRuleTableMissingHintLogged = true;
    this.logger.warn(
      `${context}: table \`decision_rule_configs\` is missing. Apply migrations: \`npx prisma migrate deploy\` (or \`npx prisma migrate dev\`) against DATABASE_URL, then restart.`,
    );
  }

  async onModuleInit(): Promise<void> {
    await this.bootstrapFromDatabase();
  }

  /**
   * First load: if DB has at least one active rule, replace in-memory overrides from DB.
   * If DB is empty of active rules, keep existing state (e.g. DECISION_RULE_OVERRIDES_PATH file).
   */
  private async bootstrapFromDatabase(): Promise<void> {
    if (!this.prisma.isDbConnected()) {
      this.logger.warn('DecisionRuleConfig sync skipped: database not connected');
      return;
    }
    try {
      const applied = await this.loadActiveIntoResolver();
      await this.refreshLastSeenFromAggregate();
      if (applied) {
        this.logger.log(`DecisionRuleConfig bootstrap: applied active rows from DB (revision=${this.resolver.getRevision()})`);
      }
    } catch (e: any) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig bootstrap');
        return;
      }
      this.logger.warn(`DecisionRuleConfig bootstrap failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Pull active rows from DB and apply to resolver. Returns true if replaceAll was invoked.
   */
  async loadActiveIntoResolver(): Promise<boolean> {
    let rows: DecisionRuleConfig[];
    try {
      rows = await this.prisma.decisionRuleConfig.findMany({
        where: { isActive: true },
      });
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig loadActiveIntoResolver');
        return false;
      }
      throw e;
    }
    const sideRows = filterSideEffectDecisionRuleRows(rows);
    if (sideRows.length === 0) {
      return false;
    }
    this.resolver.replaceAll(decisionRuleRowsToOverrideMap(sideRows));
    return true;
  }

  /**
   * List active DecisionRuleConfig rows (for admin UI / audit).
   * Returns [] when DB is not connected or the model is not migrated yet.
   */
  async listActiveRules(): Promise<Array<Pick<DecisionRuleConfig, 'id' | 'actionName' | 'handlerId' | 'params' | 'isActive' | 'updatedAt'>>> {
    if (!this.prisma.isDbConnected()) {
      return [];
    }
    try {
      return await this.prisma.decisionRuleConfig.findMany({
        where: { isActive: true },
        orderBy: [{ actionName: 'asc' }, { handlerId: 'asc' }],
      });
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig listActiveRules');
        return [];
      }
      throw e;
    }
  }

  async listActiveSideEffectRules(): Promise<Array<Pick<DecisionRuleConfig, 'id' | 'actionName' | 'handlerId' | 'params' | 'isActive' | 'updatedAt'>>> {
    const rows = await this.listActiveRules();
    return filterSideEffectDecisionRuleRows(rows);
  }

  async listActiveHardTruthRules(): Promise<Array<Pick<DecisionRuleConfig, 'id' | 'actionName' | 'handlerId' | 'params' | 'isActive' | 'updatedAt'>>> {
    const rows = await this.listActiveRules();
    return rows.filter((r) => isHardTruthDecisionRuleRow(r));
  }

  async getRuleById(id: string): Promise<DecisionRuleConfig | null> {
    if (!this.prisma.isDbConnected()) {
      return null;
    }
    try {
      return await this.prisma.decisionRuleConfig.findUnique({ where: { id } });
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig getRuleById');
        return null;
      }
      throw e;
    }
  }

  /**
   * Upsert a single rule row (sets params exactly; sets isActive=true), then refresh resolver from DB.
   */
  async upsertRuleExact(actionName: string, handlerId: string, params: Record<string, any>): Promise<DecisionRuleConfig> {
    if (!this.prisma.isDbConnected()) {
      throw new Error('Database not connected; cannot persist decision rules');
    }
    const an = String(actionName ?? '').trim();
    const hid = String(handlerId ?? '').trim();
    if (!an || !hid) {
      throw new Error('action_name and handler_id are required');
    }
    const p = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
    const row = await this.prisma.decisionRuleConfig.upsert({
      where: { actionName_handlerId: { actionName: an, handlerId: hid } },
      create: { actionName: an, handlerId: hid, params: p, isActive: true },
      update: { params: p, isActive: true },
    });
    await this.syncFromDb();
    return row;
  }

  /**
   * Soft delete: set isActive=false by id (no-op if not found), then refresh resolver from DB.
   */
  async deactivateRuleById(id: string): Promise<{ found: boolean }> {
    if (!this.prisma.isDbConnected()) {
      return { found: false };
    }
    try {
      const existing = await this.prisma.decisionRuleConfig.findUnique({ where: { id } });
      if (!existing) return { found: false };
      await this.prisma.decisionRuleConfig.update({ where: { id }, data: { isActive: false } });
      await this.syncFromDb();
      return { found: true };
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig deactivateRuleById');
        return { found: false };
      }
      throw e;
    }
  }

  async refreshLastSeenFromAggregate(): Promise<void> {
    try {
      const agg = await this.prisma.decisionRuleConfig.aggregate({
        _max: { updatedAt: true },
      });
      this.lastSeenGlobalMaxUpdatedAt = agg._max.updatedAt ?? null;
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig aggregate');
        return;
      }
      throw e;
    }
  }

  /**
   * Full sync from DB (manual or post-persist). Always reflects active rows, including empty map.
   */
  async syncFromDb(): Promise<{ ok: boolean; activeCount: number; maxUpdatedAt: string | null; revision: number }> {
    if (!this.prisma.isDbConnected()) {
      return { ok: false, activeCount: 0, maxUpdatedAt: null, revision: this.resolver.getRevision() };
    }
    let rows: DecisionRuleConfig[];
    try {
      rows = await this.prisma.decisionRuleConfig.findMany({
        where: { isActive: true },
      });
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig syncFromDb');
        return { ok: false, activeCount: 0, maxUpdatedAt: null, revision: this.resolver.getRevision() };
      }
      throw e;
    }
    const sideRows = filterSideEffectDecisionRuleRows(rows);
    this.resolver.replaceAll(decisionRuleRowsToOverrideMap(sideRows));
    await this.hardTruthRules?.refreshFromDb();
    await this.refreshLastSeenFromAggregate();
    return {
      ok: true,
      activeCount: rows.length,
      maxUpdatedAt: this.lastSeenGlobalMaxUpdatedAt?.toISOString() ?? null,
      revision: this.resolver.getRevision(),
    };
  }

  @Interval(60_000)
  async pollDatabaseForChanges(): Promise<void> {
    if (!this.prisma.isDbConnected()) {
      return;
    }
    try {
      const agg = await this.prisma.decisionRuleConfig.aggregate({
        _max: { updatedAt: true },
      });
      const dbMax = agg._max.updatedAt ?? null;
      if (!dbMax && !this.lastSeenGlobalMaxUpdatedAt) {
        return;
      }
      if (
        dbMax &&
        this.lastSeenGlobalMaxUpdatedAt &&
        dbMax.getTime() <= this.lastSeenGlobalMaxUpdatedAt.getTime()
      ) {
        return;
      }
      await this.syncFromDb();
      this.logger.debug(
        `DecisionRuleConfig poll: reloaded active rules (maxUpdatedAt=${this.lastSeenGlobalMaxUpdatedAt?.toISOString() ?? 'null'})`,
      );
    } catch (e: any) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig poll');
        return;
      }
      this.logger.warn(`DecisionRuleConfig poll failed: ${e?.message ?? e}`);
    }
  }

  /**
   * Persist a full override map (upsert each entry). Optionally soft-deactivate rows not listed.
   * Then refreshes in-memory resolver from DB.
   */
  async persistFullReplace(
    overrides: Record<string, Record<string, Record<string, any>>>,
    options?: { deactivateUnlisted?: boolean },
  ): Promise<{ upserted: number; deactivated: number }> {
    if (!this.prisma.isDbConnected()) {
      throw new Error('Database not connected; cannot persist decision rules');
    }
    const entries: Array<{ actionName: string; handlerId: string; params: Record<string, any> }> = [];
    for (const [actionName, handlers] of Object.entries(overrides ?? {})) {
      if (!handlers || typeof handlers !== 'object') continue;
      for (const [handlerId, params] of Object.entries(handlers)) {
        const p = params && typeof params === 'object' && !Array.isArray(params) ? params : {};
        entries.push({ actionName, handlerId, params: p });
      }
    }
    const key = (an: string, hid: string) => `${an}::${hid}`;
    const listed = new Set(entries.map((e) => key(e.actionName, e.handlerId)));
    let upserted = 0;
    let deactivated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const e of entries) {
        await tx.decisionRuleConfig.upsert({
          where: {
            actionName_handlerId: {
              actionName: e.actionName,
              handlerId: e.handlerId,
            },
          },
          create: {
            actionName: e.actionName,
            handlerId: e.handlerId,
            params: e.params,
            isActive: true,
          },
          update: {
            params: e.params,
            isActive: true,
          },
        });
        upserted += 1;
      }
      if (options?.deactivateUnlisted) {
        const active = await tx.decisionRuleConfig.findMany({ where: { isActive: true } });
        const activeSide = filterSideEffectDecisionRuleRows(active);
        for (const row of activeSide) {
          if (!listed.has(key(row.actionName, row.handlerId))) {
            await tx.decisionRuleConfig.update({
              where: { id: row.id },
              data: { isActive: false },
            });
            deactivated += 1;
          }
        }
      }
    });

    await this.syncFromDb();
    return { upserted, deactivated };
  }

  /**
   * Atomically persist multiple patches in one DB transaction, then sync memory once (single resolver bump).
   */
  async persistPatchBatch(patches: PersistPatchBatchItem[]): Promise<PersistPatchResult[]> {
    if (!this.prisma.isDbConnected()) {
      throw new Error('Database not connected; cannot persist decision rules');
    }
    if (patches.length === 0) {
      return [];
    }

    const results = await this.prisma.$transaction(async (tx) => {
      const out: PersistPatchResult[] = [];
      for (const p of patches) {
        const an = String(p.action_name ?? '').trim();
        const hid = String(p.handler_id ?? '').trim();
        if (!an || !hid) {
          throw new Error('Each patch requires non-empty action_name and handler_id');
        }
        if (p.params === null) {
          await tx.decisionRuleConfig.updateMany({
            where: { actionName: an, handlerId: hid, isActive: true },
            data: { isActive: false },
          });
          out.push({ action_name: an, handler_id: hid, merged: null, deactivated: true });
          continue;
        }
        const existing = await tx.decisionRuleConfig.findUnique({
          where: { actionName_handlerId: { actionName: an, handlerId: hid } },
        });
        const base =
          existing &&
          typeof existing.params === 'object' &&
          existing.params !== null &&
          !Array.isArray(existing.params)
            ? { ...(existing.params as Record<string, any>) }
            : {};
        const merged = { ...base, ...p.params };
        await tx.decisionRuleConfig.upsert({
          where: {
            actionName_handlerId: {
              actionName: an,
              handlerId: hid,
            },
          },
          create: {
            actionName: an,
            handlerId: hid,
            params: merged,
            isActive: true,
          },
          update: {
            params: merged,
            isActive: true,
          },
        });
        out.push({ action_name: an, handler_id: hid, merged, deactivated: false });
      }
      return out;
    });

    this.resolver.applyPersistBatchMemoryExact(
      results
        .filter((r) => !isHardTruthDecisionRuleRow({ actionName: r.action_name, handlerId: r.handler_id }))
        .map((r) => ({
          actionName: r.action_name,
          handlerId: r.handler_id,
          params: r.merged,
        })),
    );
    await this.hardTruthRules?.refreshFromDb();
    await this.refreshLastSeenFromAggregate();
    return results;
  }

  /**
   * Admin list with pagination + optional filters (includes inactive rows when `activeOnly` is false).
   */
  async listRulesForAdmin(opts: {
    actionNameContains?: string;
    handlerIdContains?: string;
    active?: 'all' | 'active' | 'inactive';
    take: number;
    skip: number;
  }): Promise<{ rows: DecisionRuleConfig[]; total: number }> {
    if (!this.prisma.isDbConnected()) {
      return { rows: [], total: 0 };
    }
    const active = opts.active ?? 'all';
    const where: Prisma.DecisionRuleConfigWhereInput = {
      ...(active === 'active' ? { isActive: true } : {}),
      ...(active === 'inactive' ? { isActive: false } : {}),
      ...(opts.actionNameContains?.trim()
        ? { actionName: { contains: opts.actionNameContains.trim(), mode: 'insensitive' } }
        : {}),
      ...(opts.handlerIdContains?.trim()
        ? { handlerId: { contains: opts.handlerIdContains.trim(), mode: 'insensitive' } }
        : {}),
    };
    try {
      const [rows, total] = await Promise.all([
        this.prisma.decisionRuleConfig.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }],
          take: opts.take,
          skip: opts.skip,
        }),
        this.prisma.decisionRuleConfig.count({ where }),
      ]);
      return { rows, total };
    } catch (e) {
      if (this.isDecisionRuleModelMissingError(e)) {
        this.logMigrationHintOnce('DecisionRuleConfig listRulesForAdmin');
        return { rows: [], total: 0 };
      }
      throw e;
    }
  }

  /**
   * Admin patch: merge params (via {@link persistPatchBatch}) and/or toggle `isActive`.
   * Always ends with {@link syncFromDb} so SideEffect resolver + HardTruth cache stay aligned.
   */
  async persistAdminRulePatch(input: {
    action_name: string;
    handler_id: string;
    params?: Record<string, any> | null;
    is_active?: boolean;
  }): Promise<{ merged: Record<string, any> | null; deactivated: boolean }> {
    const an = String(input.action_name ?? '').trim();
    const hid = String(input.handler_id ?? '').trim();
    if (!an || !hid) {
      throw new Error('action_name and handler_id are required');
    }
    if (input.params === undefined && input.is_active === undefined) {
      throw new Error('At least one of params or is_active is required');
    }

    // Pure activation toggle (no params merge)
    if (input.params === undefined) {
      if (input.is_active === false) {
        await this.prisma.decisionRuleConfig.updateMany({
          where: { actionName: an, handlerId: hid, isActive: true },
          data: { isActive: false },
        });
        await this.syncFromDb();
        return { merged: null, deactivated: true };
      }
      await this.prisma.decisionRuleConfig.updateMany({
        where: { actionName: an, handlerId: hid },
        data: { isActive: true },
      });
      await this.syncFromDb();
      return { merged: null, deactivated: false };
    }

    // Params patch/merge (and optional explicit activate after merge)
    const [r] = await this.persistPatchBatch([{ action_name: an, handler_id: hid, params: input.params }]);
    if (input.is_active === true) {
      await this.prisma.decisionRuleConfig.updateMany({
        where: { actionName: an, handlerId: hid },
        data: { isActive: true },
      });
      await this.syncFromDb();
    }
    return { merged: r.merged, deactivated: r.deactivated };
  }

  /**
   * Single-handler upsert: delegates to {@link persistPatchBatch} (same semantics, one row).
   */
  async persistSinglePatch(
    actionName: string,
    handlerId: string,
    params: Record<string, any> | null,
  ): Promise<{ merged: Record<string, any> | null; deactivated: boolean }> {
    const [row] = await this.persistPatchBatch([{ action_name: actionName, handler_id: handlerId, params }]);
    return { merged: row.merged, deactivated: row.deactivated };
  }
}
