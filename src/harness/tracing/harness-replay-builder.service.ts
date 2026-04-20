import { Injectable, NotFoundException } from '@nestjs/common';
import type { HarnessTrace } from './harness-trace.types';
import { HarnessTraceRecorderService } from './harness-trace-recorder.service';

export interface HarnessReplayPayload {
  trace: HarnessTrace;
  stepCount: number;
  /** 人读一行摘要，供日志或回放入口 */
  summary: string;
}

@Injectable()
export class HarnessReplayBuilderService {
  constructor(private readonly recorder: HarnessTraceRecorderService) {}

  requireTrace(traceId: string): HarnessTrace {
    const t = this.recorder.getTrace(traceId);
    if (!t) {
      throw new NotFoundException(`Harness trace not found: ${traceId}`);
    }
    return t;
  }

  /**
   * 基于已记录 trace 构造最小回放载荷（后续可接决策回放 / risk 回放 UI）。
   */
  buildReplayPayload(traceId: string): HarnessReplayPayload {
    const trace = this.requireTrace(traceId);
    const failedSteps = trace.steps
      .filter((s) => (s.validationResults ?? []).some((r) => !r.passed))
      .map((s) => s.step);
    const harnessTotalMs = trace.steps.reduce((acc, s) => acc + (s.durationMs ?? 0), 0);
    const summary = `trace=${traceId} steps=${trace.steps.length} final=${trace.finalStatus} harnessTotalMs=${harnessTotalMs} failedSteps=${failedSteps.length ? failedSteps.join(',') : 'none'}`;
    return { trace, stepCount: trace.steps.length, summary };
  }
}
