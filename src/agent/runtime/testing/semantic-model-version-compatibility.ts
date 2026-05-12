// src/agent/runtime/testing/semantic-model-version-compatibility.ts
/**
 * 执行模型版本演进语义：受控升级 allowlist + 谱系序；无 taxonomy、无 DB。
 * @see semantic-validation-contract.md §13
 */
import type { SemanticModelSnapshotDescriptor } from './semantic-model-snapshot-descriptor';
import { EXECUTION_MODEL_VERSION } from './semantic-validation-result-schema';

/** 已发布版本的**追加序**（越后越新）；新增版本时仅 append */
export const EXECUTION_MODEL_VERSION_LINEAGE = [EXECUTION_MODEL_VERSION] as const;

/**
 * 显式允许的「导出侧 → 当前 runtime」`executionModelVersion` 升级边（如未来 `v1 → v2`）。
 * 缺省边一律拒绝；降级（导出比当前新）始终拒绝。
 */
export const EXECUTION_MODEL_UPGRADE_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  [EXECUTION_MODEL_VERSION]: [],
};

export type ExecutionModelCompatibilityContext = {
  versionLineage: readonly string[];
  upgradeAllowlist: Readonly<Record<string, readonly string[]>>;
};

export const DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT: ExecutionModelCompatibilityContext = {
  versionLineage: EXECUTION_MODEL_VERSION_LINEAGE,
  upgradeAllowlist: EXECUTION_MODEL_UPGRADE_ALLOWLIST,
};

export function executionModelVersionRank(version: string, lineage: readonly string[]): number {
  return lineage.indexOf(version);
}

export type LedgerImportCompatibilityResult =
  | { ok: true; kind: 'exact' | 'upgrade' }
  | {
      ok: false;
      reason:
        | 'fingerprint_mismatch'
        | 'unknown_execution_model_version'
        | 'snapshot_newer_than_runtime'
        | 'same_version_fingerprint_mismatch'
        | 'upgrade_not_allowlisted';
    };

export function isLedgerImportCompatibilityRejected(
  r: LedgerImportCompatibilityResult,
): r is Extract<LedgerImportCompatibilityResult, { ok: false }> {
  return r.ok === false;
}

/**
 * 判定导出描述符相对当前 `validate` 描述符是否可导入。
 * - 默认（未开 `allowExecutionModelUpgrade`）：仅 `fingerprint` 完全一致。
 * - 开启后：仅允许 allowlist 中的**升级**；同版本指纹不一致、降级、未知版本均拒绝。
 */
export function evaluateLedgerImportModelCompatibility(
  exported: SemanticModelSnapshotDescriptor,
  current: SemanticModelSnapshotDescriptor,
  ctx: ExecutionModelCompatibilityContext,
  options?: { allowExecutionModelUpgrade?: boolean },
): LedgerImportCompatibilityResult {
  if (exported.fingerprint === current.fingerprint) {
    return { ok: true, kind: 'exact' };
  }
  if (!options?.allowExecutionModelUpgrade) {
    return { ok: false, reason: 'fingerprint_mismatch' };
  }

  const expRank = executionModelVersionRank(exported.executionModelVersion, ctx.versionLineage);
  const curRank = executionModelVersionRank(current.executionModelVersion, ctx.versionLineage);
  if (expRank < 0 || curRank < 0) {
    return { ok: false, reason: 'unknown_execution_model_version' };
  }
  if (expRank > curRank) {
    return { ok: false, reason: 'snapshot_newer_than_runtime' };
  }
  if (expRank === curRank) {
    return { ok: false, reason: 'same_version_fingerprint_mismatch' };
  }

  const targets = ctx.upgradeAllowlist[exported.executionModelVersion] ?? [];
  if (!targets.includes(current.executionModelVersion)) {
    return { ok: false, reason: 'upgrade_not_allowlisted' };
  }
  return { ok: true, kind: 'upgrade' };
}

export function formatLedgerImportCompatibilityFailure(
  r: Extract<LedgerImportCompatibilityResult, { ok: false }>,
  exported: SemanticModelSnapshotDescriptor,
  current: SemanticModelSnapshotDescriptor,
): string {
  switch (r.reason) {
    case 'fingerprint_mismatch':
      return `model fingerprint mismatch (export ${exported.fingerprint} vs current ${current.fingerprint})`;
    case 'unknown_execution_model_version':
      return `unknown executionModelVersion (export ${exported.executionModelVersion} vs current ${current.executionModelVersion})`;
    case 'snapshot_newer_than_runtime':
      return `snapshot executionModelVersion is newer than runtime (export ${exported.executionModelVersion} vs current ${current.executionModelVersion})`;
    case 'same_version_fingerprint_mismatch':
      return `same executionModelVersion but fingerprint drift (export ${exported.executionModelVersion}, export fp ${exported.fingerprint} vs current ${current.fingerprint})`;
    case 'upgrade_not_allowlisted':
      return `executionModelVersion upgrade not allowlisted (${exported.executionModelVersion} → ${current.executionModelVersion})`;
  }
}
