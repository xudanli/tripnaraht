// src/agent/runtime/testing/semantic-model-snapshot-ledger.ts
/**
 * 模型快照台账（最小治理层）：将 descriptor + 事件绑定为可索引实体；支持跨 runtime 的 export/import 契约。
 * @see semantic-validation-contract.md §11–§12
 */
import { randomUUID } from 'crypto';
import { validateSemanticExecutionGraph, type SemanticExecutionGraphValidationMode } from './semantic-execution-graph-validation.facade';
import type { SemanticModelSnapshotDescriptor } from './semantic-model-snapshot-descriptor';
import { compareSemanticRegression, type SemanticRegressionCompareResult } from './semantic-regression.compare';
import {
  DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT,
  evaluateLedgerImportModelCompatibility,
  formatLedgerImportCompatibilityFailure,
  isLedgerImportCompatibilityRejected,
  type ExecutionModelCompatibilityContext,
} from './semantic-model-version-compatibility';
import { SEMANTIC_VALIDATION_RESULT_SCHEMA_ID, type NormalizedSemanticTimelineEvents } from './semantic-validation-result-schema';

/** 序列化边界格式 token；变更须 bump 并登记契约 §12 */
export const SEMANTIC_LEDGER_EXPORT_FORMAT = 'semantic.model.snapshot.ledger.export@v1' as const;

/** JSON 可往返的模型实例导出（不含 DB / Nest） */
export type SemanticModelSnapshotLedgerExportV1 = {
  format: typeof SEMANTIC_LEDGER_EXPORT_FORMAT;
  id: string;
  registeredAtMs: number;
  mode: SemanticExecutionGraphValidationMode;
  modelSnapshot: SemanticModelSnapshotDescriptor;
  events: NormalizedSemanticTimelineEvents;
};

/** 受控升级导入时记录的导出侧身份（非 taxonomy） */
export type SemanticModelSnapshotImportCheckpoint = {
  fromFingerprint: string;
  fromExecutionModelVersion: string;
  fromContractRevision: string;
};

/** `listLatest` 返回行：不含事件载荷（索引/审计用） */
export type SemanticModelSnapshotLedgerRow = {
  id: string;
  schemaId: string;
  fingerprint: string;
  executionModelVersion: string;
  contractRevision: string;
  mode: SemanticExecutionGraphValidationMode;
  registeredAtMs: number;
  importCheckpoint?: SemanticModelSnapshotImportCheckpoint;
};

type LedgerEntry = {
  id: string;
  registeredAtMs: number;
  mode: SemanticExecutionGraphValidationMode;
  modelSnapshot: SemanticModelSnapshotDescriptor;
  events: NormalizedSemanticTimelineEvents;
  importCheckpoint?: SemanticModelSnapshotImportCheckpoint;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function parseDescriptor(x: unknown): SemanticModelSnapshotDescriptor {
  if (!isRecord(x)) {
    throw new TypeError('SemanticModelSnapshotLedger: modelSnapshot must be an object');
  }
  const { executionModelVersion, schemaId, contractRevision, fingerprint } = x;
  for (const [k, v] of Object.entries({ executionModelVersion, schemaId, contractRevision, fingerprint })) {
    if (typeof v !== 'string' || v.length === 0) {
      throw new TypeError(`SemanticModelSnapshotLedger: modelSnapshot.${k} must be a non-empty string`);
    }
  }
  if (schemaId !== SEMANTIC_VALIDATION_RESULT_SCHEMA_ID) {
    throw new TypeError('SemanticModelSnapshotLedger: modelSnapshot.schemaId mismatch');
  }
  return x as SemanticModelSnapshotDescriptor;
}

/** 校验未知载荷是否为 v1 导出；供 `importSnapshot` 与外部反序列化共用 */
export function parseLedgerExportV1(payload: unknown): SemanticModelSnapshotLedgerExportV1 {
  if (!isRecord(payload)) {
    throw new TypeError('SemanticModelSnapshotLedger: export payload must be a non-null object');
  }
  if (payload.format !== SEMANTIC_LEDGER_EXPORT_FORMAT) {
    throw new TypeError(
      `SemanticModelSnapshotLedger: invalid format (expected "${SEMANTIC_LEDGER_EXPORT_FORMAT}")`,
    );
  }
  const id = payload.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new TypeError('SemanticModelSnapshotLedger: id must be a non-empty string');
  }
  const registeredAtMs = payload.registeredAtMs;
  if (typeof registeredAtMs !== 'number' || !Number.isFinite(registeredAtMs)) {
    throw new TypeError('SemanticModelSnapshotLedger: registeredAtMs must be a finite number');
  }
  const mode = payload.mode;
  if (mode !== 'strict' && mode !== 'explained') {
    throw new TypeError('SemanticModelSnapshotLedger: mode must be "strict" | "explained"');
  }
  if (!Array.isArray(payload.events)) {
    throw new TypeError('SemanticModelSnapshotLedger: events must be an array');
  }
  const modelSnapshot = parseDescriptor(payload.modelSnapshot);
  return {
    format: SEMANTIC_LEDGER_EXPORT_FORMAT,
    id,
    registeredAtMs,
    mode,
    modelSnapshot,
    events: payload.events as NormalizedSemanticTimelineEvents,
  };
}

/**
 * 进程内内存台账；单测 / 脚本 / 未来控制面可复用。不替代持久化 replay store。
 */
export class SemanticModelSnapshotLedger {
  private readonly byId = new Map<string, LedgerEntry>();

  constructor(
    private readonly compatibilityCtx: ExecutionModelCompatibilityContext = DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT,
  ) {}

  /**
   * 注册一次 timeline 快照：先 `validate` 以绑定当前 `modelSnapshot`，再存事件供 `compareById`。
   * @returns 新生成的 snapshot id（UUID）
   */
  register(
    events: NormalizedSemanticTimelineEvents,
    options?: { mode?: SemanticExecutionGraphValidationMode },
  ): string {
    if (!Array.isArray(events)) {
      throw new TypeError('SemanticModelSnapshotLedger.register expects ExecutionTimelineEvent[]');
    }
    const mode = options?.mode ?? 'strict';
    const validated = validateSemanticExecutionGraph({ events, mode });
    const id = randomUUID();
    const entry: LedgerEntry = {
      id,
      registeredAtMs: Date.now(),
      mode,
      modelSnapshot: validated.modelSnapshot,
      events,
    };
    this.byId.set(id, entry);
    return id;
  }

  /** 可 `JSON.stringify` 后跨进程/文件传输；不引入新 ABI 字段到 §1 ValidationResult */
  exportSnapshot(id: string): SemanticModelSnapshotLedgerExportV1 {
    const entry = this.byId.get(id);
    if (!entry) {
      throw new Error(`SemanticModelSnapshotLedger: unknown snapshot id "${id}"`);
    }
    return {
      format: SEMANTIC_LEDGER_EXPORT_FORMAT,
      id: entry.id,
      registeredAtMs: entry.registeredAtMs,
      mode: entry.mode,
      modelSnapshot: entry.modelSnapshot,
      events: entry.events,
    };
  }

  /**
   * 从序列化对象恢复台账条目；重新 `validate`。
   * 默认：`modelSnapshot.fingerprint` 须与当前进程一致。
   * `allowExecutionModelUpgrade: true` 时：按 `semantic-model-version-compatibility.ts` allowlist 允许受控升级（见契约 §13）。
   * @returns 恢复的 snapshot id（与导出中 `id` 相同）
   */
  importSnapshot(
    payload: unknown,
    options?: { allowExecutionModelUpgrade?: boolean },
  ): string {
    const p = parseLedgerExportV1(payload);
    if (this.byId.has(p.id)) {
      throw new Error(`SemanticModelSnapshotLedger.importSnapshot: duplicate snapshot id "${p.id}"`);
    }
    const validated = validateSemanticExecutionGraph({ events: p.events, mode: p.mode });
    const compat = evaluateLedgerImportModelCompatibility(
      p.modelSnapshot,
      validated.modelSnapshot,
      this.compatibilityCtx,
      { allowExecutionModelUpgrade: options?.allowExecutionModelUpgrade === true },
    );
    if (isLedgerImportCompatibilityRejected(compat)) {
      const detail = formatLedgerImportCompatibilityFailure(compat, p.modelSnapshot, validated.modelSnapshot);
      throw new Error(`SemanticModelSnapshotLedger.importSnapshot: ${detail}`);
    }
    const importCheckpoint: SemanticModelSnapshotImportCheckpoint | undefined =
      compat.kind === 'upgrade'
        ? {
            fromFingerprint: p.modelSnapshot.fingerprint,
            fromExecutionModelVersion: p.modelSnapshot.executionModelVersion,
            fromContractRevision: p.modelSnapshot.contractRevision,
          }
        : undefined;
    const entry: LedgerEntry = {
      id: p.id,
      registeredAtMs: p.registeredAtMs,
      mode: p.mode,
      modelSnapshot: validated.modelSnapshot,
      events: [...p.events],
      importCheckpoint,
    };
    this.byId.set(p.id, entry);
    return p.id;
  }

  /** 对已注册的两条 timeline 调用既有 `compareSemanticRegression`。 */
  compareById(
    aId: string,
    bId: string,
    mode?: SemanticExecutionGraphValidationMode,
  ): SemanticRegressionCompareResult {
    const a = this.byId.get(aId);
    const b = this.byId.get(bId);
    if (!a) {
      throw new Error(`SemanticModelSnapshotLedger: unknown snapshot id "${aId}"`);
    }
    if (!b) {
      throw new Error(`SemanticModelSnapshotLedger: unknown snapshot id "${bId}"`);
    }
    return compareSemanticRegression(a.events, b.events, mode);
  }

  /** 按 `registeredAtMs` 降序；不含 `events`。 */
  listLatest(maxCount = 50): SemanticModelSnapshotLedgerRow[] {
    const n = Number.isFinite(maxCount) && maxCount >= 0 ? Math.floor(maxCount) : 50;
    const sorted = [...this.byId.values()].sort((x, y) => y.registeredAtMs - x.registeredAtMs);
    return sorted.slice(0, n).map((e) => ({
      id: e.id,
      schemaId: e.modelSnapshot.schemaId,
      fingerprint: e.modelSnapshot.fingerprint,
      executionModelVersion: e.modelSnapshot.executionModelVersion,
      contractRevision: e.modelSnapshot.contractRevision,
      mode: e.mode,
      registeredAtMs: e.registeredAtMs,
      ...(e.importCheckpoint !== undefined ? { importCheckpoint: e.importCheckpoint } : {}),
    }));
  }
}

/** `JSON.stringify` 便捷封装；键序由运行时决定，跨引擎比较请用指纹而非字节级 JSON 相等 */
export function serializeLedgerExportV1(exp: SemanticModelSnapshotLedgerExportV1): string {
  return JSON.stringify(exp);
}

export function deserializeLedgerExportV1(json: string): unknown {
  return JSON.parse(json) as unknown;
}
