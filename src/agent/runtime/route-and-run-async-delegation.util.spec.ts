import {
  parseRouteAndRunAsyncMode,
  planDeltaIndicatesHeavyPlanning,
  shouldDelegateRouteAndRunToAsync,
} from './route-and-run-async-delegation.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { signalsFromRequest } from '../utils/orchestration-signals.util';

describe('route-and-run-async-delegation.util', () => {
  const baseRequest = (overrides?: Partial<RouteAndRunRequestDto>): RouteAndRunRequestDto =>
    ({
      request_id: 'req-1',
      user_id: 'u1',
      trip_id: 'trip-1',
      message: '帮我调整第2天行程，把蓝湖改成斯蒂基斯霍尔米',
      options: { async_mode: 'AUTO', intent_mode: 'AUTO' },
      ...overrides,
    }) as RouteAndRunRequestDto;

  it('parseRouteAndRunAsyncMode defaults to OFF', () => {
    expect(parseRouteAndRunAsyncMode(undefined)).toBe('OFF');
    expect(parseRouteAndRunAsyncMode('AUTO')).toBe('AUTO');
    expect(parseRouteAndRunAsyncMode('FORCE')).toBe('FORCE');
  });

  it('planDeltaIndicatesHeavyPlanning detects POI/HOTEL', () => {
    expect(planDeltaIndicatesHeavyPlanning([{ target: { type: 'POI' } }])).toBe(true);
    expect(planDeltaIndicatesHeavyPlanning([{ target: { type: 'NOTE' } }])).toBe(false);
  });

  it('AUTO delegates TRIP_PLANNING with plan delta', () => {
    const request = baseRequest();
    const signals = signalsFromRequest(request);
    expect(
      shouldDelegateRouteAndRunToAsync({
        request,
        signals,
        planDelta: [{ target: { type: 'POI' } }],
      }),
    ).toBe(true);
  });

  it('AUTO skips when would redirect to planning workbench', () => {
    const request = baseRequest({
      trip_id: undefined,
      message: '帮我规划5天冰岛环岛',
    });
    expect(
      shouldDelegateRouteAndRunToAsync({
        request,
        signals: signalsFromRequest(request),
        wouldRedirectToPlanningWorkbench: true,
      }),
    ).toBe(false);
  });

  it('FORCE always delegates when not dry_run', () => {
    const request = baseRequest({
      options: { async_mode: 'FORCE' },
      message: '今天天气怎么样',
    });
    expect(
      shouldDelegateRouteAndRunToAsync({
        request,
        signals: signalsFromRequest(request),
      }),
    ).toBe(true);
  });
});
