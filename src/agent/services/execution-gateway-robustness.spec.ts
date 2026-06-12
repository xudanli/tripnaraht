import { Test } from '@nestjs/testing';
import { ExecutionGatewayService } from './execution-gateway.service';
import { AgentService } from './agent.service';
import type { RouteAndRunRequestDto, RouteAndRunResponseDto } from '../dto/route-and-run.dto';
import type { ItineraryDay } from '../interfaces/trip-plan.interface';

describe('ExecutionGatewayService.enrichResponseWithRobustnessRollout', () => {
  const agentStub = {} as AgentService;

  function buildModule() {
    return Test.createTestingModule({
      providers: [
        ExecutionGatewayService,
        { provide: AgentService, useValue: agentStub },
      ],
    }).compile();
  }

  function sampleDays(): ItineraryDay[] {
    return [
      {
        date: '2026-09-01',
        items: [
          {
            id: 'n1',
            type: 'DRIVE',
            start_window: '08:00',
            end_window: '14:00',
            location_ref: { name: 'Leg', coordinates: { lat: 64, lng: -22 } },
            metadata: { duration_minutes: 360 },
            evidence_refs: [],
            verified: true,
            verification_status: 'VERIFIED',
          },
        ],
      },
    ];
  }

  it('enriches OK response with robustness_dashboard', async () => {
    process.env.ROBUSTNESS_ROLLOUT_ENABLED = '1';
    process.env.ROBUSTNESS_ROLLOUT_SAMPLES = '10';

    const mod = await buildModule();
    const gw = mod.get(ExecutionGatewayService);

    const request = {
      request_id: 'r1',
      user_id: 'u',
      trip_id: 't1',
      message: 'plan',
      options: {},
    } as RouteAndRunRequestDto;

    const response = {
      request_id: 'r1',
      route: { route: 'SYSTEM2' },
      result: {
        status: 'OK',
        answer_text: '',
        payload: { timeline: sampleDays(), robustness: null },
      },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
      },
    } as RouteAndRunResponseDto;

    const enriched = gw.enrichResponseWithRobustnessRollout(request, response);
    const dash = (enriched.observability as { robustness_dashboard?: { schema?: string } })
      .robustness_dashboard;
    expect(dash?.schema).toBe('tripnara.robustness_dashboard@v1');
    expect(enriched.result?.payload?.robustness).toBeGreaterThanOrEqual(0);

    await mod.close();
  });

  it('returns original response when policy disabled', async () => {
    process.env.ROBUSTNESS_ROLLOUT_ENABLED = '0';
    const mod = await buildModule();
    const gw = mod.get(ExecutionGatewayService);
    const request = {
      request_id: 'r2',
      user_id: 'u',
      trip_id: 't',
      message: 'm',
      options: {},
    } as RouteAndRunRequestDto;
    const response = {
      request_id: 'r2',
      route: { route: 'X' },
      result: { status: 'OK', answer_text: '', payload: { timeline: sampleDays() } },
      explain: { decision_log: [] },
      observability: {
        latency_ms: 1,
        router_ms: 0,
        system_mode: 'SYSTEM2',
        tool_calls: 0,
        browser_steps: 0,
        tokens_est: 0,
        cost_est_usd: 0,
        fallback_used: false,
      },
    } as RouteAndRunResponseDto;

    const out = gw.enrichResponseWithRobustnessRollout(request, response);
    expect((out.observability as { robustness_dashboard?: unknown }).robustness_dashboard).toBeUndefined();
    await mod.close();
  });
});
