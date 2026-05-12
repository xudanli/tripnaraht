// src/agent/runtime/testing/semantic-execution-graph-validation.facade.ts
/**
 * Semantic Validation Facade：CI / 回放只依赖此单入口；内部可演进（topology / completeness / …），ABI 不向外扩散。
 *
 * CONTRACT: 见 `semantic-validation-contract.md`（§1–§3、§6–§9）。应用侧优先 `SemanticValidationService`（§8–§9）。
 */
import { Logger } from '@nestjs/common';
import type { NormalizedSemanticTimelineEvents } from './semantic-validation-result-schema';
import { emitSemanticContractDrift } from './semantic-contract-drift.emitter';
import {
  diffSemanticGoldPathTopology,
  diffSemanticGraphCompleteness,
  type SemanticTopologyDiff,
} from './semantic-replay-golden-path.util';
import {
  buildSemanticModelSnapshotDescriptor,
  type SemanticModelSnapshotDescriptor,
} from './semantic-model-snapshot-descriptor';

export type { SemanticModelSnapshotDescriptor } from './semantic-model-snapshot-descriptor';
export { buildSemanticModelSnapshotDescriptor } from './semantic-model-snapshot-descriptor';
import {
  EXECUTION_MODEL_VERSION,
  SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
  SEMANTIC_VALIDATION_RESULT_VERSION,
} from './semantic-validation-result-schema';

export type SemanticExecutionGraphValidationMode = 'strict' | 'explained';

export type SemanticExecutionGraphValidationResult = {
  /** 显式 ABI：与 contract 文档 revision 独立演进 */
  schemaId: typeof SEMANTIC_VALIDATION_RESULT_SCHEMA_ID;
  version: typeof SEMANTIC_VALIDATION_RESULT_VERSION;
  /** 语义执行图模型版本（身份层，非 timeline schemaAbi） */
  executionModelVersion: typeof EXECUTION_MODEL_VERSION;
  /** 可比较的模型整体身份（指纹不含事件 multiset） */
  modelSnapshot: SemanticModelSnapshotDescriptor;
  ok: boolean;
  mode: SemanticExecutionGraphValidationMode;
  topology: SemanticTopologyDiff;
  completeness: SemanticTopologyDiff;
  /** 确定性合并：topology 行在前，completeness 行在后 */
  lines: string[];
};

/** @alias 文档中的 SemanticValidationResult (v1) */
export type SemanticValidationResultV1 = SemanticExecutionGraphValidationResult;

const contractGuardLogger = new Logger('SemanticValidationContract');

function warnIfContractViolated(
  mode: SemanticExecutionGraphValidationMode,
  topology: SemanticTopologyDiff,
  completeness: SemanticTopologyDiff,
  lines: string[],
  ok: boolean,
): void {
  if (mode !== 'strict' && mode !== 'explained') {
    emitSemanticContractDrift(contractGuardLogger, 'mode_mismatch', `invalid mode "${String(mode)}"`, {});
  }
  const expectedOk = topology.ok && completeness.ok;
  if (ok !== expectedOk) {
    emitSemanticContractDrift(
      contractGuardLogger,
      'topology_mismatch',
      '`ok` diverges from topology.ok && completeness.ok',
    );
  }
  const expectedLines = [...topology.lines, ...completeness.lines];
  if (expectedLines.length !== lines.length || expectedLines.some((row, i) => row !== lines[i])) {
    emitSemanticContractDrift(
      contractGuardLogger,
      'lines_mismatch',
      'merged `lines` diverge from topology.lines ++ completeness.lines',
    );
  }
}

/**
 * 单一语义编译器式入口：`strict` 与 `explained` 当前行为一致；日后可在 `explained` 下追加非失败诊断行而不改 `ok` 语义。
 */
export function validateSemanticExecutionGraph(input: {
  events: NormalizedSemanticTimelineEvents;
  mode?: SemanticExecutionGraphValidationMode;
}): SemanticExecutionGraphValidationResult {
  const mode = input.mode ?? 'strict';
  const topology = diffSemanticGoldPathTopology(input.events);
  const completeness = diffSemanticGraphCompleteness(input.events);
  const lines = [...topology.lines, ...completeness.lines];
  const ok = topology.ok && completeness.ok;
  const result: SemanticExecutionGraphValidationResult = {
    schemaId: SEMANTIC_VALIDATION_RESULT_SCHEMA_ID,
    version: SEMANTIC_VALIDATION_RESULT_VERSION,
    executionModelVersion: EXECUTION_MODEL_VERSION,
    modelSnapshot: buildSemanticModelSnapshotDescriptor(),
    ok,
    mode,
    topology,
    completeness,
    lines,
  };
  warnIfContractViolated(mode, topology, completeness, lines, ok);
  return result;
}

export class SemanticGraphValidationError extends Error {
  readonly lines: string[];
  constructor(lines: string[]) {
    super(lines.join('\n'));
    this.name = 'SemanticGraphValidationError';
    this.lines = lines;
  }
}

export function assertSemanticExecutionGraph(input: {
  events: NormalizedSemanticTimelineEvents;
  mode?: SemanticExecutionGraphValidationMode;
}): void {
  const r = validateSemanticExecutionGraph(input);
  if (!r.ok) {
    throw new SemanticGraphValidationError(r.lines);
  }
}
