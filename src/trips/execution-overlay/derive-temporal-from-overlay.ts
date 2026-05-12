/**
 * PR-B：Temporal 真相 = ExecutionOverlayFrame 的投影，而非独立 drift 解释层。
 *
 * 不读取 raw TimeDrift；仅消费 frame 内已融合的 temporal / execution 字段。
 */

import type {
  ExecutionOverlayFrame,
  DerivedTemporalProjection,
  TemporalProjectionSeverity,
} from './execution-overlay-frame.types';

function deriveTemporalSeverity(frame: ExecutionOverlayFrame): TemporalProjectionSeverity {
  if (frame.finalExecutionState === 'BLOCKED' || frame.temporal.crossDayRisk > 0.85) {
    return 'CRITICAL';
  }
  if (
    frame.finalExecutionState === 'HIGH_RISK' ||
    frame.temporal.daylightViolation ||
    frame.temporal.crossDayRisk > 0.45
  ) {
    return 'HIGH';
  }
  if (frame.finalExecutionState === 'DEGRADED' || frame.temporal.unifiedDelayMinutes > 25) {
    return 'MEDIUM';
  }
  return 'LOW';
}

/** 单腿 temporal 视图 —— 与 raw PROPAGATE_* drift 解耦。 */
export function deriveTemporalProjectionFromFrame(
  frame: ExecutionOverlayFrame,
): DerivedTemporalProjection {
  return {
    unifiedDelayMinutes: frame.temporal.unifiedDelayMinutes,
    crossDayRisk: frame.temporal.crossDayRisk,
    driftMinutes: frame.temporal.driftMinutes,
    temporalSeverity: deriveTemporalSeverity(frame),
  };
}

export function deriveTemporalProjectionsFromOverlay(
  frames: ExecutionOverlayFrame[],
): DerivedTemporalProjection[] {
  return frames.map(deriveTemporalProjectionFromFrame);
}
