import {
  isInfrastructureFastTrackCandidate,
  inferDefaultAgenticToolPacks,
  parseAgenticToolPacksEnv,
  parseFeatureTaskClosureBooking,
} from './agentic-tool-loop-dispatch.util';
import type { RoutingSignals } from './orchestration-signals.util';

function baseSignals(over: Partial<RoutingSignals>): RoutingSignals {
  return {
    taskType: 'DATA_LOOKUP',
    capability: 'FAST_QA',
    actionKind: 'TRIP_SCOPED_CONSULTATION',
    risk: 'LOW',
    needsAudit: false,
    latencyBudgetMs: 30_000,
    complexity: 'SIMPLE',
    requiresStructuredOutput: false,
    expectsToolCalls: false,
    legacyWellSupported: true,
    intent_mode_requested: 'AUTO',
    intent_mode_resolved: 'DATA_LOOKUP',
    ...over,
  };
}

describe('agentic-tool-loop-dispatch', () => {
  it('matches simple weather lookup', () => {
    expect(
      isInfrastructureFastTrackCandidate(baseSignals({}), '大阪明天天气怎么样'),
    ).toBe(true);
  });

  it('blocks trip planning task type', () => {
    expect(
      isInfrastructureFastTrackCandidate(baseSignals({ taskType: 'TRIP_PLANNING' }), '大阪天气'),
    ).toBe(false);
  });

  it('inferDefaultAgenticToolPacks adds exa and hotel when keywords present', () => {
    expect(inferDefaultAgenticToolPacks('网上搜索冰岛攻略')).toEqual(expect.arrayContaining(['weather', 'exa']));
    expect(inferDefaultAgenticToolPacks('推荐大阪酒店')).toEqual(expect.arrayContaining(['weather', 'hotel']));
  });

  it('parseAgenticToolPacksEnv parses CSV', () => {
    expect(parseAgenticToolPacksEnv('weather,hotel')).toEqual(['weather', 'hotel']);
    expect(parseAgenticToolPacksEnv('weather,calendar')).toEqual(['weather', 'calendar']);
  });

  it('parseFeatureTaskClosureBooking', () => {
    expect(parseFeatureTaskClosureBooking('true')).toBe(true);
    expect(parseFeatureTaskClosureBooking('0')).toBe(false);
  });
});
