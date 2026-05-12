// src/agent/runtime/testing/semantic-regression.compare.ts
/**
 * 双快照语义对比（无 taxonomy、无 AI）；输入须为归一化 timeline 事件列表。
 * @see semantic-validation-contract.md §9
 */
import type { ExecutionTimelineEvent } from '../execution-timeline-event.interface';
import { validateSemanticExecutionGraph, type SemanticExecutionGraphValidationMode } from './semantic-execution-graph-validation.facade';
import { buildSemanticModelSnapshotDescriptor, type SemanticModelSnapshotDescriptor } from './semantic-model-snapshot-descriptor';
import type { SemanticTopologyDiff } from './semantic-replay-golden-path.util';
import { EXECUTION_MODEL_VERSION } from './semantic-validation-result-schema';

export type SemanticRegressionCompareResult = {
  executionModelVersion: typeof EXECUTION_MODEL_VERSION;
  /** 与两侧 validate 共用同一模型身份；指纹锚定 compare 的「A/B 是什么模型状态」 */
  modelSnapshot: SemanticModelSnapshotDescriptor;
  /** 两侧 topology 切片原样保留，由消费方解释 drift */
  topologyDrift: { left: SemanticTopologyDiff; right: SemanticTopologyDiff };
  completenessDelta: { left: SemanticTopologyDiff; right: SemanticTopologyDiff };
  /** 整体验证 ok 与合并 lines 的对称差（确定性排序） */
  contractSliceDiff: {
    okLeft: boolean;
    okRight: boolean;
    linesOnlyInLeft: string[];
    linesOnlyInRight: string[];
  };
  /**
   * v1 不采集 Logger JSON 流；占位供未来 replay / 日志管道对齐。
   * 非 taxonomy，仅为扩展锚点。
   */
  driftEventStreamDiff: readonly [];
};

function symmetricLineDelta(left: string[], right: string[]): { linesOnlyInLeft: string[]; linesOnlyInRight: string[] } {
  const setR = new Set(right);
  const setL = new Set(left);
  return {
    linesOnlyInLeft: [...left].filter((x) => !setR.has(x)).sort(),
    linesOnlyInRight: [...right].filter((x) => !setL.has(x)).sort(),
  };
}

export function compareSemanticRegression(
  eventsLeft: ExecutionTimelineEvent[],
  eventsRight: ExecutionTimelineEvent[],
  mode?: SemanticExecutionGraphValidationMode,
): SemanticRegressionCompareResult {
  const m = mode ?? 'strict';
  const left = validateSemanticExecutionGraph({ events: eventsLeft, mode: m });
  const right = validateSemanticExecutionGraph({ events: eventsRight, mode: m });
  const delta = symmetricLineDelta(left.lines, right.lines);
  return {
    executionModelVersion: EXECUTION_MODEL_VERSION,
    modelSnapshot: buildSemanticModelSnapshotDescriptor(),
    topologyDrift: { left: left.topology, right: right.topology },
    completenessDelta: { left: left.completeness, right: right.completeness },
    contractSliceDiff: {
      okLeft: left.ok,
      okRight: right.ok,
      linesOnlyInLeft: delta.linesOnlyInLeft,
      linesOnlyInRight: delta.linesOnlyInRight,
    },
    driftEventStreamDiff: [],
  };
}
