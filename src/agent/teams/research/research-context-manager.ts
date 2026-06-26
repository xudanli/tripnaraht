import type {
  ResearchContextMergeManifest,
  ResearchContextPhase,
  ResearchMergeAttribution,
  ResearchContextSnapshot,
} from './research-context.types';
import type { ResearchScopedPatchScope, ScopedResearchPatch } from './research-team-bus.types';
import { inferResearchKeyScope, isResearchAssetScope, markResearchScopeFreshness } from '../../utils/research-asset-scope.util';

export function deepCloneResearchData(input: Record<string, unknown>): Record<string, unknown> {
  const sc = (globalThis as { structuredClone?: (x: unknown) => unknown }).structuredClone;
  try {
    if (sc) return sc(input) as Record<string, unknown>;
  } catch {
    // fall through
  }
  try {
    return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  } catch {
    return { ...input };
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return a === b;
  const ta = typeof a;
  const tb = typeof b;
  if (ta !== tb) return false;
  if (ta === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

export class ResearchPatchScopeViolationError extends Error {
  constructor(
    readonly key: string,
    readonly patchScope: ResearchScopedPatchScope,
    readonly inferredScope: string,
  ) {
    super(`ResearchPatch scope violation: key=${key} patchScope=${patchScope} inferredScope=${inferredScope}`);
    this.name = 'ResearchPatchScopeViolationError';
  }
}

function assertResearchPatchKeyAllowed(key: string, patchScope: ResearchScopedPatchScope): void {
  if (key.startsWith('__')) return;
  const inferred = inferResearchKeyScope(key);
  if (inferred !== patchScope) {
    throw new ResearchPatchScopeViolationError(key, patchScope, inferred);
  }
}

/** 将 Member patch 拆成「域内键」与「common 等跨域键」（如 destination 成员写入的 cost_estimate）。 */
export function partitionResearchPatchByScope(patch: ScopedResearchPatch): {
  scopedPartial: Record<string, unknown>;
  outOfScopePartial: Record<string, unknown>;
} {
  const scopedPartial: Record<string, unknown> = {};
  const outOfScopePartial: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(patch.researchDataPartial)) {
    if (key.startsWith('__') || inferResearchKeyScope(key) === patch.scope) {
      scopedPartial[key] = val;
    } else {
      outOfScopePartial[key] = val;
    }
  }
  return { scopedPartial, outOfScopePartial };
}

function clonePatchValue(v: unknown): unknown {
  const sc = (globalThis as { structuredClone?: (x: unknown) => unknown }).structuredClone;
  try {
    if (typeof sc === 'function') return sc(v);
  } catch {
    // fall through
  }
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

/**
 * 从 prior 研究快照按域抽取缝合 Patch（超时 / Member 失败降级用）。
 */
export function createSuturePatchFromPrior(input: {
  scope: ResearchScopedPatchScope;
  priorResearchData: Record<string, unknown>;
}): ScopedResearchPatch {
  const partial: Record<string, unknown> = {};
  for (const key of Object.keys(input.priorResearchData)) {
    if (key.startsWith('__')) continue;
    if (inferResearchKeyScope(key) !== input.scope) continue;
    partial[key] = clonePatchValue(input.priorResearchData[key]);
  }
  const evidenceRefsAppended: readonly string[] = [];
  const base = { researchDataPartial: partial, evidenceRefsAppended };
  const { scope } = input;
  if (scope === 'hotel') return { scope: 'hotel', ...base };
  if (scope === 'flight') return { scope: 'flight', ...base };
  if (scope === 'destination') return { scope: 'destination', ...base };
  if (scope === 'transport') return { scope: 'transport', ...base };
  return { scope: 'compliance', ...base };
}

/**
 * 从隔离沙箱相对基线计算显式 Patch（与 `mergeFromIsolatedRun` 的 diff 语义一致）。
 */
export function computeResearchPatchFromIsolation(input: {
  baselineResearchData: Record<string, unknown>;
  isolatedResearchData: Record<string, unknown>;
  baselineEvidenceRefs: readonly string[];
  isolatedEvidenceRefs: readonly string[];
  scope: ResearchScopedPatchScope;
}): ScopedResearchPatch {
  const { baselineResearchData, isolatedResearchData, baselineEvidenceRefs, isolatedEvidenceRefs, scope } = input;
  const researchDataPartial: Record<string, unknown> = {};
  for (const key of Object.keys(isolatedResearchData)) {
    if (!valuesEqual(baselineResearchData[key], isolatedResearchData[key])) {
      researchDataPartial[key] = isolatedResearchData[key];
    }
  }
  const baselineSet = new Set(baselineEvidenceRefs.map(String));
  const evidenceRefsAppended = isolatedEvidenceRefs.filter(
    (r) => typeof r === 'string' && r.trim() && !baselineSet.has(r),
  );
  const base = { researchDataPartial, evidenceRefsAppended };
  if (scope === 'hotel') return { scope: 'hotel', ...base };
  if (scope === 'flight') return { scope: 'flight', ...base };
  if (scope === 'destination') return { scope: 'destination', ...base };
  if (scope === 'transport') return { scope: 'transport', ...base };
  return { scope: 'compliance', ...base };
}

/**
 * 研究上下文管家：Member 只在 fork 出的沙箱上突变，再按阶段合并回主干，
 * 降低并行域互相踩踏同一引用的风险，并为显式 Patch 契约留钩子。
 */
export class ResearchContextManager {
  private readonly mergeLog: ResearchContextMergeManifest[] = [];

  constructor(
    private readonly researchData: Record<string, unknown>,
    private readonly evidenceRefs: string[],
  ) {}

  getMergeLog(): readonly ResearchContextMergeManifest[] {
    return this.mergeLog;
  }

  getSnapshot(): ResearchContextSnapshot {
    return Object.freeze({
      researchData: Object.freeze(deepCloneResearchData(this.researchData)) as Readonly<
        Record<string, unknown>
      >,
      evidenceRefs: Object.freeze([...this.evidenceRefs]),
    });
  }

  forkResearchData(): Record<string, unknown> {
    return deepCloneResearchData(this.researchData);
  }

  forkEvidenceRefs(): string[] {
    return [...this.evidenceRefs];
  }

  /**
   * 将「从同一基线 fork 的沙箱」结果合并回主干：仅覆盖相对 `baselineResearchData` 发生变化的顶层键；
   * evidenceRefs 做去重追加。
   */
  mergeFromIsolatedRun(input: {
    baselineResearchData: Record<string, unknown>;
    isolatedResearchData: Record<string, unknown>;
    isolatedEvidenceRefs: string[];
    source: string;
    phase: ResearchContextPhase;
    attribution?: ResearchMergeAttribution;
  }): void {
    const { baselineResearchData, isolatedResearchData, isolatedEvidenceRefs, source, phase } = input;
    const attribution = input.attribution ?? 'MEMBER_PATCH';
    const keysTouched: string[] = [];
    for (const key of Object.keys(isolatedResearchData)) {
      if (!valuesEqual(baselineResearchData[key], isolatedResearchData[key])) {
        this.researchData[key] = isolatedResearchData[key];
        keysTouched.push(key);
      }
    }
    let appended = 0;
    for (const ref of isolatedEvidenceRefs) {
      if (typeof ref === 'string' && ref.trim() && !this.evidenceRefs.includes(ref)) {
        this.evidenceRefs.push(ref);
        appended += 1;
      }
    }
    this.mergeLog.push({
      source,
      phase,
      keysTouched,
      evidenceRefsAppended: appended,
      attribution,
    });
  }

  /**
   * 应用 Member 显式返回的 Scoped Patch（键域权限校验 + 顶层写回 + evidence 去重追加）。
   */
  applyResearchPatch(input: {
    patch: ScopedResearchPatch;
    source: string;
    phase: ResearchContextPhase;
    attribution?: ResearchMergeAttribution;
  }): void {
    const { patch, source, phase } = input;
    const attribution = input.attribution ?? 'MEMBER_PATCH';
    const { scopedPartial, outOfScopePartial } = partitionResearchPatchByScope(patch);
    const keysTouched: string[] = [];
    for (const [key, val] of Object.entries(scopedPartial)) {
      assertResearchPatchKeyAllowed(key, patch.scope);
      this.researchData[key] = val;
      keysTouched.push(key);
    }
    for (const [key, val] of Object.entries(outOfScopePartial)) {
      this.researchData[key] = val;
      keysTouched.push(key);
    }
    let appended = 0;
    for (const ref of patch.evidenceRefsAppended) {
      if (typeof ref === 'string' && ref.trim() && !this.evidenceRefs.includes(ref)) {
        this.evidenceRefs.push(ref.trim());
        appended += 1;
      }
    }
    this.mergeLog.push({
      source,
      phase,
      keysTouched,
      evidenceRefsAppended: appended,
      attribution,
    });
    if (attribution === 'FALLBACK_SUTURE' && isResearchAssetScope(patch.scope)) {
      markResearchScopeFreshness(this.researchData, patch.scope, 'STALE_RECOVERED', {
        attribution: 'HARNESS:FALLBACK_SUTURE',
      });
    }
  }

  /** 合并 common 等跨域键（不经 scope gate，供 destination bundle 内的 CostAgent 等）。 */
  mergeResearchDataKeys(input: {
    keys: Record<string, unknown>;
    source: string;
    phase: ResearchContextPhase;
    attribution?: ResearchMergeAttribution;
  }): void {
    const keysTouched = Object.keys(input.keys);
    if (!keysTouched.length) return;
    for (const [key, val] of Object.entries(input.keys)) {
      this.researchData[key] = val;
    }
    this.mergeLog.push({
      source: input.source,
      phase: input.phase,
      keysTouched,
      evidenceRefsAppended: 0,
      attribution: input.attribution ?? 'MEMBER_PATCH',
    });
  }

  /**
   * 串行或 pre 阶段：基线为当前主干快照（fork 即基线）。
   */
  async runIsolated<T>(
    source: string,
    phase: ResearchContextPhase,
    run: (researchData: Record<string, unknown>, evidenceRefs: string[]) => Promise<T>,
  ): Promise<T> {
    const baselineResearchData = this.forkResearchData();
    const isolatedResearchData = this.forkResearchData();
    const isolatedEvidenceRefs = this.forkEvidenceRefs();
    const out = await run(isolatedResearchData, isolatedEvidenceRefs);
    this.mergeFromIsolatedRun({
      baselineResearchData,
      isolatedResearchData,
      isolatedEvidenceRefs,
      source,
      phase,
    });
    return out;
  }

  /**
   * 并行批：各槽共享同一基线（通常为 pre_parallel 之后的主干快照），再按 `slotOrder` 稳定合并。
   */
  async runParallelSlotsMerged<T>(
    slots: readonly { source: string; run: (rd: Record<string, unknown>, er: string[]) => Promise<T> }[],
  ): Promise<T[]> {
    const baselineResearchData = this.forkResearchData();
    const baselineEvidenceRefs = this.forkEvidenceRefs();

    const settled = await Promise.all(
      slots.map(async (slot, index) => {
        const rd = deepCloneResearchData(baselineResearchData);
        const er = [...baselineEvidenceRefs];
        const result = await slot.run(rd, er);
        return { index, source: slot.source, rd, er, result };
      }),
    );
    settled.sort((a, b) => a.index - b.index);
    for (const { source, rd, er } of settled) {
      this.mergeFromIsolatedRun({
        baselineResearchData,
        isolatedResearchData: rd,
        isolatedEvidenceRefs: er,
        source,
        phase: 'parallel',
      });
    }
    return settled.map((s) => s.result);
  }
}
