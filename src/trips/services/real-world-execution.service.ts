import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ExecutionAction } from '../draft-synthesis/real-world-execution/execution-action.types';
import type { ExecutionFeedback } from '../draft-synthesis/real-world-execution/execution-feedback.types';
import {
  executionFailureToWorldBusEvent,
  executionSuccessToWorldBusEvent,
} from '../draft-synthesis/real-world-execution/execution-feedback-fold.engine';
import { WorldBusService } from './world-bus.service';

export interface DispatchExecutionResult {
  actions: ExecutionAction[];
  feedback: ExecutionFeedback[];
}

/**
 * 现实执行层占位实现：同步标记 SUCCESS；失败路径留给适配器 / 队列。
 * 失败/成功可经 WorldBus 进入全局世界状态。
 */
@Injectable()
export class RealWorldExecutionService {
  private readonly logger = new Logger(RealWorldExecutionService.name);

  constructor(@Optional() private readonly worldBus?: WorldBusService) {}

  /**
   * 投递动作批次（stub：全部 SUCCESS）。生产替换为 OTA/地图 SDK 编排。
   */
  async dispatchActions(actions: ExecutionAction[]): Promise<DispatchExecutionResult> {
    const now = Date.now();
    const done: ExecutionAction[] = actions.map((a) => ({
      ...a,
      status: 'SUCCESS' as const,
    }));
    const feedback: ExecutionFeedback[] = done.map((a) => ({
      actionId: a.id,
      outcome: 'SUCCESS' as const,
      timestamp: now,
    }));
    if (this.worldBus) {
      for (let i = 0; i < done.length; i++) {
        const ev = executionSuccessToWorldBusEvent(done[i], feedback[i]);
        this.worldBus.emit(ev);
      }
    }
    return { actions: done, feedback };
  }

  /**
   * 记录失败并可选向上折叠到全局世界状态（预订失败 → CROWD/负载信号）。
   */
  recordFailure(action: ExecutionAction, detail: string, externalCode?: string): ExecutionFeedback {
    const fb: ExecutionFeedback = {
      actionId: action.id,
      outcome: 'FAILED',
      detail,
      timestamp: Date.now(),
      externalCode,
    };
    const ev = executionFailureToWorldBusEvent(fb, action);
    if (ev && this.worldBus) {
      this.worldBus.emit(ev);
      this.logger.warn(`Execution failure folded to WorldBus: ${ev.subType} place=${ev.placeId}`);
    }
    return fb;
  }
}
