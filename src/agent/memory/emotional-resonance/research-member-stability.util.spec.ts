import { FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD } from './emotional-resonance.constants';
import type { UserEmotionalAccount } from './user-emotional-account.types';
import { shouldEnableStabilityMode } from './research-member-stability.util';

describe('research-member-stability.util', () => {
  const acct = (fr: number): UserEmotionalAccount => ({
    accumulated_goodwill: 0,
    current_tolerance_bonus: 0.3,
    frustration_score: fr,
  });

  it('挫败分低于阈值 → 不启用稳健模式', () => {
    expect(shouldEnableStabilityMode(acct(FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD - 0.01))).toBe(false);
  });

  it('挫败分达到阈值 → 启用稳健模式', () => {
    expect(shouldEnableStabilityMode(acct(FRUSTRATION_CIRCUIT_BREAKER_THRESHOLD))).toBe(true);
  });
});
