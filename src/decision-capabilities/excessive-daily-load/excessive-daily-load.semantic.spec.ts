import {
  buildExcessiveDailyLoadSemanticKey,
  normalizeExcessiveDailyLoadSemanticKey,
} from './excessive-daily-load.semantic';

describe('excessive-daily-load.semantic', () => {
  it('LOAD-SEM-001: builds canonical key', () => {
    expect(buildExcessiveDailyLoadSemanticKey('evt_l1')).toBe(
      'EXCESSIVE_DAILY_LOAD:evt_l1',
    );
  });

  it('LOAD-SEM-002: normalizes legacy prefix', () => {
    expect(normalizeExcessiveDailyLoadSemanticKey('rfc001:load:evt_l1')).toBe(
      'EXCESSIVE_DAILY_LOAD:evt_l1',
    );
  });
});
