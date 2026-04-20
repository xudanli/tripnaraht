import { Injectable } from '@nestjs/common';
import type { HarnessTrace } from '../tracing/harness-trace.types';
import type { HarnessExportableTrajectory } from './exportable-trajectory.types';

@Injectable()
export class HarnessTrajectoryExporterService {
  /**
   * 将内存 trace 转为可落盘/训练管道的轨迹结构。
   */
  toExportable(
    trace: HarnessTrace,
    opts?: { tripId?: string; modelVersion?: string },
  ): HarnessExportableTrajectory {
    let hardFailures = 0;
    let logicGaps = 0;
    for (const step of trace.steps) {
      for (const v of step.validationResults ?? []) {
        if (v.passed) continue;
        if (v.severity === 'L3') hardFailures += 1;
        else if (v.severity === 'L2') logicGaps += 1;
      }
      for (const g of step.graderResults ?? []) {
        if (g.passed) continue;
        if (g.severity === 'L3') hardFailures += 1;
        else if (g.severity === 'L2') logicGaps += 1;
      }
    }
    const passed = hardFailures === 0 && trace.finalStatus !== 'BLOCKED' && trace.finalStatus !== 'FAILED';
    return {
      traceId: trace.traceId,
      requestId: trace.requestId,
      tripId: opts?.tripId,
      modelVersion: opts?.modelVersion,
      meta: trace.meta,
      finalStatus: trace.finalStatus,
      steps: trace.steps,
      validationSummary: {
        passed,
        hardFailures,
        logicGaps,
      },
    };
  }
}
