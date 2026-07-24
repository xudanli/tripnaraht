import { classifyTripIntent, extractDayIndexFromMessage } from './classify-trip-intent.util';

describe('classify-trip-intent.util', () => {
  it('classifies planning intent', () => {
    const r = classifyTripIntent('帮我规划冰岛 8 天');
    expect(r.kind).toBe('PLAN_TRIP');
    expect(r.triggerKind).toBe('LEGACY_AGENT_ROUTE');
  });

  it('classifies feasibility check', () => {
    const r = classifyTripIntent('这个行程能走吗');
    expect(r.kind).toBe('FEASIBILITY_CHECK');
  });

  it('classifies modify itinerary with day reference', () => {
    const r = classifyTripIntent('第三天太累了，能不能轻松一点');
    expect(r.kind).toBe('MODIFY_ITINERARY');
    expect(extractDayIndexFromMessage('第三天太累了')).toBe(2);
  });

  it('classifies weather risk', () => {
    const r = classifyTripIntent('明天下雨怎么办');
    expect(r.kind).toBe('WEATHER_RISK');
    expect(r.triggerKind).toBe('CANONICAL_MONITORING_POLL');
  });

  it('classifies decision status', () => {
    const r = classifyTripIntent('有哪些问题需要处理');
    expect(r.kind).toBe('DECISION_STATUS');
  });

  it('classifies swap lodging', () => {
    const r = classifyTripIntent('帮我换一个住宿');
    expect(r.kind).toBe('SWAP_LODGING');
  });
});
