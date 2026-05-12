// src/agent/runtime/testing/semantic-validation.service.ts
/**
 * 对外稳定入口：消费方只依赖本 Service（或 Module），不直接散落调用 util / facade。
 * @see semantic-validation-contract.md §8
 */
import { Injectable } from '@nestjs/common';
import {
  validateSemanticExecutionGraph,
  type SemanticExecutionGraphValidationMode,
  type SemanticValidationResultV1,
} from './semantic-execution-graph-validation.facade';
import { compareSemanticRegression, type SemanticRegressionCompareResult } from './semantic-regression.compare';
import type { NormalizedSemanticTimelineEvents } from './semantic-validation-result-schema';

@Injectable()
export class SemanticValidationService {
  /**
   * 语义执行图校验单入口；等价于 `validateSemanticExecutionGraph`（含 contract guard / drift JSON）。
   * 仅接受归一化 timeline 事件数组（禁止 request / ALS / 原始 runtime 句柄）。
   */
  validate(
    events: NormalizedSemanticTimelineEvents,
    options?: { mode?: SemanticExecutionGraphValidationMode },
  ): SemanticValidationResultV1 {
    if (!Array.isArray(events)) {
      throw new TypeError('SemanticValidationService.validate expects ExecutionTimelineEvent[]');
    }
    return validateSemanticExecutionGraph({ events, mode: options?.mode });
  }

  /** 双快照语义回归对比；不采集 Logger drift 流（见 compare 结果 `driftEventStreamDiff`） */
  compare(
    eventsLeft: NormalizedSemanticTimelineEvents,
    eventsRight: NormalizedSemanticTimelineEvents,
    options?: { mode?: SemanticExecutionGraphValidationMode },
  ): SemanticRegressionCompareResult {
    if (!Array.isArray(eventsLeft) || !Array.isArray(eventsRight)) {
      throw new TypeError('SemanticValidationService.compare expects two ExecutionTimelineEvent[]');
    }
    return compareSemanticRegression(eventsLeft, eventsRight, options?.mode);
  }
}
