import { buildShadowGraderObservabilitySlice } from './shadow-grader-observability.util';
import {
  markShadowGraderSchedule,
  readShadowGraderScheduleMark,
} from './shadow-grader-request-mark.util';

describe('shadow-grader-observability.util', () => {
  it('builds route_and_run observability slice', () => {
    const slice = buildShadowGraderObservabilitySlice({
      requestId: 'r1',
      scheduleMark: { scheduled: true, shadow_version: 'shadow-task-a', marked_at: new Date().toISOString() },
      activeShadowVersion: 'shadow-task-a',
      aggregate: {
        sampleCount: 10,
        shadowWinRate: 0.6,
        promotionReady: false,
        productionSafetyPassRate: 1,
        shadowSafetyPassRate: 0.9,
      } as never,
    });
    expect(slice.schemaId).toBe('tripnara.shadow_grader@v1');
    expect(slice.scheduled).toBe(true);
    expect(slice.aggregate?.sampleCount).toBe(10);
  });

  it('request mark is one-shot', () => {
    markShadowGraderSchedule('req-1', { scheduled: false, skip_reason: 'disabled' });
    expect(readShadowGraderScheduleMark('req-1')?.skip_reason).toBe('disabled');
    expect(readShadowGraderScheduleMark('req-1')).toBeUndefined();
  });

  it('surfaces trajectory_capture_off skip reason', () => {
    const prev = process.env.HARNESS_SHADOW_GRADER;
    process.env.HARNESS_SHADOW_GRADER = '1';
    delete process.env.DECISION_TRAJECTORY_ENABLED;
    const slice = buildShadowGraderObservabilitySlice({
      requestId: 'r-off',
      scheduleMark: { scheduled: false, skip_reason: 'trajectory_capture_off', marked_at: new Date().toISOString() },
      activeShadowVersion: 'shadow-task-a',
    });
    expect(slice.skip_reason).toBe('trajectory_capture_off');
    if (prev === undefined) delete process.env.HARNESS_SHADOW_GRADER;
    else process.env.HARNESS_SHADOW_GRADER = prev;
  });
});
