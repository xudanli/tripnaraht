/**
 * trusted_delivery_v1 装配契约：Assembler 投影字段可被前端稳定消费。
 */
import { projectTrustedDeliveryV1 } from './utils/trusted-delivery.project.util';
import { TRUSTED_DELIVERY_SCHEMA_ID } from './trusted-delivery.constants';
import type { TrustedDeliveryV1 } from './types/trusted-delivery-v1.type';

describe('trusted_delivery_v1 consumption contract', () => {
  it('payload shape matches TrustedDeliveryV1 for UI clients', () => {
    const payload: { trusted_delivery_v1: TrustedDeliveryV1 } = {
      trusted_delivery_v1: projectTrustedDeliveryV1({
        currentStep: 'NARRATE',
        resultStatus: 'OK',
        progressPercent: 90,
        progressMessage: '生成说明中',
        agentRunTrace: {
          schemaId: 'tripnara.agent_run_trace@v1',
          version: 1,
          request_id: 'c1',
          final_delivery_status: 'OK',
          nodes: [
            {
              step: 'RESEARCH',
              outputs_summary: 'ok',
              duration_ms: 3,
            },
          ],
          fallbacks: [],
          at: new Date().toISOString(),
        },
      }),
    };

    expect(payload.trusted_delivery_v1.schemaId).toBe(TRUSTED_DELIVERY_SCHEMA_ID);
    expect(payload.trusted_delivery_v1.task_progress.phase).toBe('narrating');
    expect(payload.trusted_delivery_v1.user_confirm.required).toBe(false);
    expect(payload.trusted_delivery_v1.ai_operation_log[0].label_zh).toBe('调研中');
    // 前端只读公共字段，禁止回传内部 step
    expect(JSON.stringify(payload.trusted_delivery_v1)).not.toMatch(/poi_selection|KERNEL_/);
  });
});
