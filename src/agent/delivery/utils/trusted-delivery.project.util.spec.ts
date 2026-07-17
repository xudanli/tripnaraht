import { projectTrustedDeliveryV1 } from './trusted-delivery.project.util';
import type { AgentRunTraceV1 } from '../../orchestration/agent-run-trace.util';

describe('trusted-delivery.project.util', () => {
  it('maps internal steps to public phases without exposing node ids', () => {
    const trace: AgentRunTraceV1 = {
      schemaId: 'tripnara.agent_run_trace@v1',
      version: 1,
      request_id: 'r1',
      final_delivery_status: 'NEED_MORE_INFO',
      nodes: [
        {
          step: 'RESEARCH',
          outputs_summary: '调研完成',
          duration_ms: 10,
        },
        {
          step: 'poi_selection',
          outputs_summary: '选点完成',
          duration_ms: 5,
        },
      ],
      fallbacks: [
        {
          schemaId: 'tripnara.phase_execution_path@v1',
          version: 1,
          phase: 'PLAN_GEN',
          path: 'legacy_callback',
          reason: 'flag_off',
          at: new Date().toISOString(),
        },
      ],
      at: new Date().toISOString(),
    };

    const out = projectTrustedDeliveryV1({
      currentStep: 'RESEARCH',
      resultStatus: 'NEED_MORE_INFO',
      progressPercent: 40,
      agentRunTrace: trace,
      flawedDraft: {
        schemaId: 'tripnara.flawed_draft@v1',
        version: 1,
        is_flawed: true,
        reasons: [{ code: 'GATE_ADJUST_REQUIRED', detail_zh: '需调整' }],
        headline_zh: '瑕疵草案',
        user_action_recommended: true,
      } as any,
    });

    expect(out.task_progress.phase).toBe('researching');
    expect(out.task_progress.label_zh).toBe('调研中');
    expect(out.user_confirm.required).toBe(true);
    expect(out.degraded_explanation.present).toBe(true);
    expect(out.degraded_explanation.reasons_zh?.join('')).not.toContain('KERNEL');
    expect(out.flawed_disclosure.present).toBe(true);
    expect(JSON.stringify(out)).not.toContain('poi_selection');
    expect(out.ai_operation_log.some((e) => e.label_zh === '调研中')).toBe(true);
  });
});
