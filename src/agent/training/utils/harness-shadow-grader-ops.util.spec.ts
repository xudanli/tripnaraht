import {
  buildShadowGraderOpsReadiness,
  summarizeShadowRegistrations,
} from './harness-shadow-grader-ops.util';

describe('harness-shadow-grader-ops.util', () => {
  it('blocks when grader or trajectory capture is off', () => {
    const off = buildShadowGraderOpsReadiness({
      graderEnabled: false,
      trajectoryCaptureEnabled: false,
      activeShadow: null,
    });
    expect(off.ready).toBe(false);
    expect(off.blockers).toEqual(
      expect.arrayContaining([
        'HARNESS_SHADOW_GRADER_off',
        'DECISION_TRAJECTORY_ENABLED_off',
        'no_active_shadow',
      ]),
    );
  });

  it('ready when grader + trajectory + ACTIVE shadow', () => {
    const ready = buildShadowGraderOpsReadiness({
      graderEnabled: true,
      trajectoryCaptureEnabled: true,
      activeShadow: {
        shadowVersion: 'shadow-task-a',
        taskId: 'task-a',
        adapterPath: '/app/outputs/a',
        vllmAdapterName: 'shadow_task_a',
        routingStrategy: 'SHADOW_GRADER_ONLY',
        minValidationScore: 0.92,
        baselineProductionVersion: 'production-stable',
        lifecycle: 'ACTIVE',
        registeredAt: '2026-01-01T00:00:00.000Z',
        loraLoaded: true,
      },
    });
    expect(ready.ready).toBe(true);
    expect(ready.blockers).toEqual([]);
  });

  it('summarizes registrations for admin/CLI', () => {
    const rows = summarizeShadowRegistrations([
      {
        shadowVersion: 'shadow-task-a',
        taskId: 'task-a',
        adapterPath: '/app/outputs/a',
        vllmAdapterName: 'shadow_task_a',
        routingStrategy: 'SHADOW_GRADER_ONLY',
        minValidationScore: 0.92,
        baselineProductionVersion: 'production-stable',
        lifecycle: 'REGISTERING',
        registeredAt: '2026-01-01T00:00:00.000Z',
        loraLoaded: false,
      },
    ]);
    expect(rows[0]).toMatchObject({
      shadow_version: 'shadow-task-a',
      lifecycle: 'REGISTERING',
      lora_loaded: false,
    });
  });
});
