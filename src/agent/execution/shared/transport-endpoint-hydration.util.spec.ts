import type { DecisionState } from '../../../decision/kernel/decision-state.types';
import {
  estimatePossibleRegionMismatch,
  fieldNeedsTransportHydrationOrIsInvalid,
  hydrateTripPlanTransportEndpoints,
  normalizeHydratedTransportEndpoint,
  normalizeTransportEndpointsForSkill,
  resolveGeographicEndpointFromHistory,
} from './transport-endpoint-hydration.util';

function minimalDso(partial: Partial<DecisionState>): DecisionState {
  return {
    userIntent: partial.userIntent ?? {},
    tripState: {},
    environmentState: {},
    systemState: { requestId: 't1' },
    history: partial.history,
  } as DecisionState;
}

describe('transport-endpoint-hydration.util', () => {
  it('hydrateTripPlanTransportEndpoints 应用 userIntent 中的坐标替换「起点」', () => {
    const dso = minimalDso({
      userIntent: { origin: { lat: 30.1, lng: 120.2 } },
    });
    const { trip, patchedFields } = hydrateTripPlanTransportEndpoints(dso, {
      origin: '起点',
      destination: 'Hangzhou',
    });
    expect(patchedFields).toEqual(['origin']);
    expect(trip?.origin).toEqual({ lat: 30.1, lng: 120.2 });
    expect(trip?.destination).toBe('Hangzhou');
  });

  it('history 倒序快照在 userIntent 无坐标时回填 origin', () => {
    const dso = minimalDso({
      userIntent: {},
      history: [
        { type: 'weather', at: '2026-01-01T00:00:00Z' },
        {
          type: 'userIntent',
          at: '2026-01-02T00:00:00Z',
          next: { userIntent: { origin: { lat: 64.5, lng: -21.5 } } },
        },
      ],
    });
    const { trip, patchedFields } = hydrateTripPlanTransportEndpoints(dso, {
      origin: '起点',
      destination: 'Akureyri',
    });
    expect(patchedFields).toContain('origin');
    expect(trip?.origin).toEqual({ lat: 64.5, lng: -21.5 });
  });

  it('normalizeHydratedTransportEndpoint 将 lat,lng 字符串转为坐标对象', () => {
    expect(normalizeHydratedTransportEndpoint('64.1,-21.9', 'origin')).toEqual({ lat: 64.1, lng: -21.9 });
  });

  it('normalizeTransportEndpointsForSkill 将两端 lat,lng 字符串归一为对象', () => {
    const n = normalizeTransportEndpointsForSkill({
      origin: '1,2',
      destination: '3,4',
    });
    expect(n).toEqual({
      origin: { lat: 1, lng: 2 },
      destination: { lat: 3, lng: 4 },
    });
  });

  it('normalizeTransportEndpointsForSkill 接受坐标对象两端', () => {
    const n = normalizeTransportEndpointsForSkill({
      origin: { lat: 1, lng: 2 },
      destination: { lat: 3, lng: 4 },
    });
    expect(n).toEqual({
      origin: { lat: 1, lng: 2 },
      destination: { lat: 3, lng: 4 },
    });
  });

  it('fieldNeedsTransportHydrationOrIsInvalid 识别指代词', () => {
    expect(fieldNeedsTransportHydrationOrIsInvalid('起点', 'origin')).toBe(true);
    expect(fieldNeedsTransportHydrationOrIsInvalid('上海', 'origin')).toBe(false);
    expect(fieldNeedsTransportHydrationOrIsInvalid({ lat: 0, lng: 0 }, 'destination')).toBe(false);
  });

  it('resolveGeographicEndpointFromHistory 取最近一条含坐标的快照', () => {
    const dso = minimalDso({
      history: [
        { type: 'userIntent', at: 't0', next: { userIntent: { origin: { lat: 1, lng: 1 } } } },
        { type: 'userIntent', at: 't1', next: { userIntent: { origin: { lat: 9, lng: 9 } } } },
      ],
    });
    expect(resolveGeographicEndpointFromHistory(dso, 'origin')).toEqual({ lat: 9, lng: 9 });
  });

  it('hydrateTripPlanTransportEndpoints 从 recentMessages 回溯 origin', () => {
    const dso = minimalDso({ userIntent: {} });
    const { trip, patchedFields, provenance, derived_from_history } = hydrateTripPlanTransportEndpoints(
      dso,
      { origin: '起点', destination: 'Akureyri' },
      { recentMessages: ['用户: 我从 64.2,-21.8 出发'] },
    );
    expect(patchedFields).toContain('origin');
    expect(trip?.origin).toEqual({ lat: 64.2, lng: -21.8 });
    expect(provenance?.origin).toBe('conversation');
    expect(derived_from_history).toContain('origin');
  });

  it('estimatePossibleRegionMismatch 在冰岛目的地 + 华东坐标 origin 时提示', () => {
    const hint = estimatePossibleRegionMismatch({
      origin: { lat: 31.2, lng: 121.4 },
      destination: '冰岛环岛',
    } as any);
    expect(hint).toBe('possible_region_mismatch');
  });
});
