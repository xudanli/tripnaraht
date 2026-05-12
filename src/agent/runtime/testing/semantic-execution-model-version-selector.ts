// src/agent/runtime/testing/semantic-execution-model-version-selector.ts
/**
 * 运行时执行模型版本选择（纯策略）：为回放 / A·B / 渐进发布提供单一入口；不路由多套内核实现。
 * @see semantic-validation-contract.md §14
 */
import {
  DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT,
  executionModelVersionRank,
  type ExecutionModelCompatibilityContext,
} from './semantic-model-version-compatibility';
import { EXECUTION_MODEL_VERSION } from './semantic-validation-result-schema';

export type ExecutionModelVersionSelectionContext = {
  /** 回放或调用方声明的意图版本；缺省 = 完全跟随宿主内核 */
  requestedExecutionModelVersion?: string;
};

export type ExecutionModelVersionSelection =
  | {
      ok: true;
      /** 本进程实际执行的宿主内核版本（与 `EXECUTION_MODEL_VERSION` 对齐；多内核实现未落地前恒为宿主） */
      activeExecutionModelVersion: string;
      /**
       * 对 `importSnapshot(payload, { allowExecutionModelUpgrade })` 的**建议**：
       * 仅当「请求版本落后于宿主」且 allowlist 含 `requested → host` 边时为 true。
       */
      suggestAllowExecutionModelUpgradeForImport: boolean;
      basis: 'host_default' | 'requested_aligned' | 'requested_behind_host';
    }
  | {
      ok: false;
      reason: 'unknown_requested_version' | 'requested_newer_than_host';
      hostExecutionModelVersion: string;
      requestedExecutionModelVersion: string;
    };

/**
 * 在给定谱系与 allowlist 下，解析「意图版本」与宿主内核的关系。
 * 不执行 I/O；不替代 `importSnapshot` 的最终门禁（仍由 §13 判定）。
 */
export function selectExecutionModelVersion(
  ctx: ExecutionModelVersionSelectionContext,
  options?: {
    hostExecutionModelVersion?: string;
    compatibility?: ExecutionModelCompatibilityContext;
  },
): ExecutionModelVersionSelection {
  const host = options?.hostExecutionModelVersion ?? EXECUTION_MODEL_VERSION;
  const compat = options?.compatibility ?? DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT;
  const lineage = compat.versionLineage;

  const raw = ctx.requestedExecutionModelVersion;
  const req = typeof raw === 'string' ? raw.trim() : '';
  if (req.length === 0) {
    return {
      ok: true,
      activeExecutionModelVersion: host,
      suggestAllowExecutionModelUpgradeForImport: false,
      basis: 'host_default',
    };
  }

  const reqRank = executionModelVersionRank(req, lineage);
  const hostRank = executionModelVersionRank(host, lineage);
  if (reqRank < 0 || hostRank < 0) {
    return {
      ok: false,
      reason: 'unknown_requested_version',
      hostExecutionModelVersion: host,
      requestedExecutionModelVersion: req,
    };
  }

  if (reqRank > hostRank) {
    return {
      ok: false,
      reason: 'requested_newer_than_host',
      hostExecutionModelVersion: host,
      requestedExecutionModelVersion: req,
    };
  }

  if (reqRank === hostRank) {
    return {
      ok: true,
      activeExecutionModelVersion: host,
      suggestAllowExecutionModelUpgradeForImport: false,
      basis: 'requested_aligned',
    };
  }

  const targets = compat.upgradeAllowlist[req] ?? [];
  const suggestAllowExecutionModelUpgradeForImport = targets.includes(host);

  return {
    ok: true,
    activeExecutionModelVersion: host,
    suggestAllowExecutionModelUpgradeForImport,
    basis: 'requested_behind_host',
  };
}
