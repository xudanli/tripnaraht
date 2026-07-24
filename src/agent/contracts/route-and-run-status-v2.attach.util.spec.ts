import { attachRouteAndRunStatusV2ToResponse } from './route-and-run-status-v2.attach.util';
import type { RouteAndRunResponseDto } from '../dto/route-and-run.dto';

function baseResponse(): RouteAndRunResponseDto {
  return {
    request_id: 'req_v2',
    route: { route: 'SYSTEM2_REASONING', confidence: 0.5, reasons: [] },
    result: {
      status: 'OK',
      answer_text: 'draft',
      payload: {
        timeline: [{ day: 1, items: [] }],
        canonical_mutation_guard: {
          canCommit: false,
          statusV2: {
            execution: { status: 'SUCCEEDED' },
            decision: { status: 'PARTIAL' },
            freshness: { status: 'PENDING_VERIFICATION' },
            action: { status: 'BLOCKED' },
          },
        },
      },
    },
    explain: { decision_log: [] },
    observability: {},
  };
}

describe('route-and-run-status-v2.attach.util', () => {
  it('attaches result_status_v2 from canonical_mutation_guard without changing legacy status', () => {
    const response = attachRouteAndRunStatusV2ToResponse(baseResponse());
    expect(response.result.status).toBe('OK');
    const v2 = (response.observability as any)?.result_status_v2;
    expect(v2?.schemaId).toBe('tripnara.route_and_run.status@v2');
    expect(v2?.action?.status).toBe('BLOCKED');
    expect(v2?.decision?.status).toBe('PARTIAL');
  });

  it('infers V2 from legacy when no guard payload present', () => {
    const response = attachRouteAndRunStatusV2ToResponse({
      ...baseResponse(),
      result: {
        status: 'NEED_CONFIRMATION',
        answer_text: 'confirm',
        payload: {},
      },
    });
    const v2 = (response.observability as any)?.result_status_v2;
    expect(v2?.decision?.status).toBe('NEEDS_CONFIRMATION');
  });
});
