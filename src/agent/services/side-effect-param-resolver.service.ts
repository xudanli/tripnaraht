// src/agent/services/side-effect-param-resolver.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { readFile } from 'node:fs/promises';

/**
 * Normalized side-effect wiring item (matches Action.side_effect_configs entries).
 */
export type SideEffectConfigItem = {
  handlerId: string;
  params?: Record<string, any>;
};

export type SideEffectParamOverridesFile = {
  /** Optional file schema: { "side_effect_param_overrides": { [actionName]: { [handlerId]: params } } } } */
  side_effect_param_overrides?: Record<string, Record<string, Record<string, any>>>;
};

/**
 * Runtime layer-2 overrides for SideEffect handler params (ttl_seconds, hold_ratio, …).
 * Code defaults live on Action.side_effect_configs; this service merges admin/DB-sourced patches
 * so operations can tune behavior without redeploying.
 *
 * Future: swap the in-memory map for Redis/PostgreSQL loaders; keep the same resolve() API.
 */
@Injectable()
export class SideEffectParamResolverService implements OnModuleInit {
  private readonly logger = new Logger(SideEffectParamResolverService.name);

  private readonly overrideByAction = new Map<string, Map<string, Record<string, any>>>();
  private revision = 0;
  private readonly subscribers = new Set<() => void>();

  getRevision(): number {
    return this.revision;
  }

  /**
   * Subscribe to config bumps (e.g. admin save, Redis pub/sub bridge). Returns unsubscribe.
   */
  subscribe(listener: () => void): () => void {
    this.subscribers.add(listener);
    return () => this.subscribers.delete(listener);
  }

  private bump(): void {
    this.revision += 1;
    for (const fn of this.subscribers) {
      try {
        fn();
      } catch (e: any) {
        this.logger.warn(`side_effect param subscriber error: ${e?.message ?? e}`);
      }
    }
  }

  /**
   * Merge registry defaults with runtime overrides for one action.
   */
  resolve(actionName: string, base: SideEffectConfigItem[]): SideEffectConfigItem[] {
    const om = this.overrideByAction.get(actionName);
    if (!om || om.size === 0) {
      return base.map((c) => ({
        handlerId: c.handlerId,
        ...(c.params !== undefined ? { params: { ...c.params } } : {}),
      }));
    }
    return base.map((c) => {
      const patch = om.get(c.handlerId);
      if (!patch) {
        return {
          handlerId: c.handlerId,
          ...(c.params !== undefined ? { params: { ...c.params } } : {}),
        };
      }
      return {
        handlerId: c.handlerId,
        params: { ...(c.params ?? {}), ...patch },
      };
    });
  }

  /**
   * Shallow-merge params for (actionName, handlerId). Pass null to remove override for that handler.
   */
  setOverride(actionName: string, handlerId: string, params: Record<string, any> | null): void {
    this.applyOverrideNoBump(actionName, handlerId, params);
    this.bump();
  }

  /**
   * Replace the in-memory override cell for one handler (no merge with the previous cell).
   * Use after DB upsert so memory matches persisted JSON exactly. null removes the handler entry.
   */
  setOverrideExact(actionName: string, handlerId: string, params: Record<string, any> | null): void {
    this.applyOverrideExactNoBump(actionName, handlerId, params);
    this.bump();
  }

  /**
   * After a successful Prisma $transaction, sync multiple handler cells with a single revision bump.
   */
  applyPersistBatchMemoryExact(
    updates: Array<{ actionName: string; handlerId: string; params: Record<string, any> | null }>,
  ): void {
    if (updates.length === 0) return;
    for (const u of updates) {
      const an = String(u.actionName ?? '').trim();
      const hid = String(u.handlerId ?? '').trim();
      if (!an || !hid) continue;
      this.applyOverrideExactNoBump(an, hid, u.params);
    }
    this.bump();
  }

  private applyOverrideExactNoBump(actionName: string, handlerId: string, params: Record<string, any> | null): void {
    if (params === null) {
      this.applyOverrideNoBump(actionName, handlerId, null);
      return;
    }
    let m = this.overrideByAction.get(actionName);
    if (!m) {
      m = new Map();
      this.overrideByAction.set(actionName, m);
    }
    m.set(handlerId, { ...params });
  }

  private applyOverrideNoBump(actionName: string, handlerId: string, params: Record<string, any> | null): void {
    let m = this.overrideByAction.get(actionName);
    if (params === null) {
      if (m) {
        m.delete(handlerId);
        if (m.size === 0) this.overrideByAction.delete(actionName);
      }
      return;
    }
    if (!m) {
      m = new Map();
      this.overrideByAction.set(actionName, m);
    }
    m.set(handlerId, { ...(m.get(handlerId) ?? {}), ...params });
  }

  applyPatches(
    patches: Array<{ action_name: string; handler_id: string; params: Record<string, any> | null }>,
  ): void {
    if (patches.length === 0) return;
    for (const p of patches) {
      this.applyOverrideNoBump(String(p.action_name ?? ''), String(p.handler_id ?? ''), p.params);
    }
    this.bump();
  }

  replaceAll(overrides: Record<string, Record<string, Record<string, any>>>): void {
    this.overrideByAction.clear();
    for (const [actionName, handlers] of Object.entries(overrides)) {
      const m = new Map<string, Record<string, any>>();
      for (const [handlerId, params] of Object.entries(handlers)) {
        m.set(handlerId, { ...params });
      }
      this.overrideByAction.set(actionName, m);
    }
    this.bump();
  }

  getSnapshot(): { revision: number; overrides: Record<string, Record<string, Record<string, any>>> } {
    const overrides: Record<string, Record<string, Record<string, any>>> = {};
    for (const [actionName, m] of this.overrideByAction) {
      overrides[actionName] = {};
      for (const [handlerId, params] of m) {
        overrides[actionName][handlerId] = { ...params };
      }
    }
    return { revision: this.revision, overrides };
  }

  async onModuleInit(): Promise<void> {
    const path = process.env.DECISION_RULE_OVERRIDES_PATH?.trim();
    if (!path) return;
    try {
      const raw = await readFile(path, 'utf8');
      const data = JSON.parse(raw) as SideEffectParamOverridesFile;
      const o = data?.side_effect_param_overrides;
      if (o && typeof o === 'object') {
        this.replaceAll(o);
        this.logger.log(`Loaded side_effect param overrides from ${path} (revision=${this.revision})`);
      }
    } catch (e: any) {
      this.logger.warn(`DECISION_RULE_OVERRIDES_PATH not loaded (${path}): ${e?.message ?? e}`);
    }
  }
}
