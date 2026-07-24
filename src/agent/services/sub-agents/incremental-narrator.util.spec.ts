import type { PlanDeltaIR } from '../../contracts/plan-delta-ir.types';
import type { OrchestratorState } from '../../interfaces/trip-plan.interface';
import {
  extractAffectedDayIndices,
  loadNarrativeDayCache,
  persistNarrativeDayCache,
} from './incremental-narrator.util';

describe('incremental-narrator.util', () => {
  it('extractAffectedDayIndices: 无 delta 时全量刷新', () => {
    const r = extractAffectedDayIndices([], 3);
    expect(r.isIncremental).toBe(false);
    expect(r.affectedZeroBased).toEqual([0, 1, 2]);
  });

  it('extractAffectedDayIndices: 按 dayIndex 精准提取', () => {
    const deltas: PlanDeltaIR[] = [
      { op: 'REPLACE', target: { type: 'POI', dayIndex: 2 }, payload: { query: '涩谷' } },
    ];
    const r = extractAffectedDayIndices(deltas, 5);
    expect(r.isIncremental).toBe(true);
    expect(r.affectedZeroBased).toEqual([2]);
  });

  it('extractAffectedDayIndices: 无 dayIndex 的全局 delta 触发全量', () => {
    const deltas: PlanDeltaIR[] = [
      { op: 'REPLACE', target: { type: 'FLIGHT' }, payload: {} },
    ];
    const r = extractAffectedDayIndices(deltas, 4);
    expect(r.isIncremental).toBe(true);
    expect(r.affectedZeroBased).toEqual([0, 1, 2, 3]);
  });

  it('loadNarrativeDayCache 从 narration 与 metadata 合并', () => {
    const state = {
      request_id: 'r1',
      narration: {
        user_friendly_summary: '',
        day_by_day_narrative: [
          { day: 1, date: '2026-06-01', narrative: '第一天缓存' },
        ],
        highlights: [],
        tips: [],
      },
      metadata: {
        started_at: 't',
        last_updated_at: 't',
        narrative_day_cache: { '2': '第三天 metadata 缓存' },
      },
    } as unknown as OrchestratorState;

    const cache = loadNarrativeDayCache(state);
    expect(cache[0]).toBe('第一天缓存');
    expect(cache[2]).toBe('第三天 metadata 缓存');
  });

  it('persistNarrativeDayCache 写回 metadata', () => {
    const state = {
      request_id: 'r1',
      metadata: { started_at: 't', last_updated_at: 't' },
    } as unknown as OrchestratorState;

    persistNarrativeDayCache(state, { 0: 'D1', 1: 'D2' });
    expect(state.metadata.narrative_day_cache).toEqual({ '0': 'D1', '1': 'D2' });
  });
});
