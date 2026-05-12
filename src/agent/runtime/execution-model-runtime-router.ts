// src/agent/runtime/execution-model-runtime-router.ts
/**
 * route_and_run 入口：执行前语义执行模型版本路由（仅决策，不切换多内核实现）。
 * 组合 `selectExecutionModelVersion`（§14）与 allowUpgrade 意图；不修改 ledger / §13 兼容内核。
 */
import { selectExecutionModelVersion } from './testing/semantic-execution-model-version-selector';
import { DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT } from './testing/semantic-model-version-compatibility';
import { EXECUTION_MODEL_VERSION } from './testing/semantic-validation-result-schema';

export type ExecutionModelRuntimeRouterInput = {
  snapshotId: string;
  executionModelVersion?: string;
  allowUpgrade?: boolean;
  runtimeHint?: string;
};

export type ExecutionModelRuntimeRouterReason = 'exact_match' | 'upgrade_allowed' | 'fallback';

export type ExecutionModelRuntimeRouterResult = {
  selectedExecutionModelVersion: string;
  reason: ExecutionModelRuntimeRouterReason;
};

export class ExecutionModelRuntimeRouter {
  select(input: ExecutionModelRuntimeRouterInput): ExecutionModelRuntimeRouterResult {
    void input.snapshotId;
    void input.runtimeHint;

    const host = EXECUTION_MODEL_VERSION;
    const sel = selectExecutionModelVersion(
      { requestedExecutionModelVersion: input.executionModelVersion?.trim() },
      { hostExecutionModelVersion: host, compatibility: DEFAULT_EXECUTION_MODEL_COMPATIBILITY_CONTEXT },
    );

    if (!sel.ok) {
      return { selectedExecutionModelVersion: host, reason: 'fallback' };
    }

    if (sel.basis === 'host_default' || sel.basis === 'requested_aligned') {
      return { selectedExecutionModelVersion: sel.activeExecutionModelVersion, reason: 'exact_match' };
    }

    if (input.allowUpgrade === true && sel.suggestAllowExecutionModelUpgradeForImport) {
      return { selectedExecutionModelVersion: sel.activeExecutionModelVersion, reason: 'upgrade_allowed' };
    }

    return { selectedExecutionModelVersion: sel.activeExecutionModelVersion, reason: 'fallback' };
  }
}

export const EXECUTION_MODEL_RUNTIME_ROUTER = new ExecutionModelRuntimeRouter();
