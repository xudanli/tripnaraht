import {
  extractDayIndexFromUtterance,
  extractUnifiedIntentSignals,
} from './unified-intent-signals.util';
import { isDayLodgingChoiceQuery } from '../utils/day-lodging-choice.util';
import { isHotelInventorySearchQuery } from '../utils/orchestration-signals.util';

describe('unified-intent lodging + [日程] DayN', () => {
  const pref =
    '预算上限控制在3000元人民币，最好是可以看到一些自然景色，厨房没有限制要求，然后是需要标间的\n\n[日程] Day2 Day 2 · 黄金圈';

  it('keeps Day2 LODGING scope from schedule on room-preference follow-up', () => {
    expect(extractDayIndexFromUtterance(pref)).toBe(2);
    expect(isDayLodgingChoiceQuery(pref)).toBe(true);
    expect(isHotelInventorySearchQuery(pref)).toBe(true);
    const s = extractUnifiedIntentSignals({ message: pref, tripId: 't1' });
    expect(s.dayIndex).toBe(2);
    expect(s.topic).toBe('LODGING');
    expect(s.scope).toBe('DAY');
  });

  it('「替换上的酒店选择」+ Day2 → hotel inventory, not local-edit replace', () => {
    const msg = '我要有替换上的酒店选择\n\n[日程] Day2 Day 2 · 黄金圈';
    expect(isDayLodgingChoiceQuery(msg)).toBe(true);
    expect(isHotelInventorySearchQuery(msg)).toBe(true);
    const { resolveUnifiedIntent } = require('./unified-intent.resolver') as typeof import('./unified-intent.resolver');
    const {
      tryLiveRouteTakeover,
      mapLocalEditMessageToCreOperation,
    } = require('./unified-intent.execution-route') as typeof import('./unified-intent.execution-route');
    const d = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    expect(d.semanticIntent).toBe('CONSULT');
    expect(d.topic).toBe('LODGING');
    expect(d.target.dayIndex).toBe(2);
    const live = tryLiveRouteTakeover(d, msg, 't1');
    expect(live?.kind).toBe('CONSULT');
    expect(mapLocalEditMessageToCreOperation(msg)).toBe('CHANGE_ACCOMMODATION');
  });
});
