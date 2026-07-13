import {
  isAssertionPromotionEnabled,
  isAssertionPromotionShadowMode,
  isTripEligibleForAssertionPromotion,
  DEFAULT_WEATHER_CANARY_TRIP_ID,
} from './assertion-promotion.config';

describe('assertion-promotion.config', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('defaults shadow mode on', () => {
    delete process.env.ASSERTION_PROMOTION_SHADOW_MODE;
    expect(isAssertionPromotionShadowMode()).toBe(true);
  });

  it('restricts phase1 to weather canary allowlist', () => {
    process.env.ASSERTION_PROMOTION_ENABLED = '1';
    process.env.ASSERTION_PROMOTION_TRIP_ALLOWLIST = DEFAULT_WEATHER_CANARY_TRIP_ID;
    expect(isAssertionPromotionEnabled()).toBe(true);
    expect(isTripEligibleForAssertionPromotion(DEFAULT_WEATHER_CANARY_TRIP_ID)).toBe(true);
    expect(isTripEligibleForAssertionPromotion('b0b88888-8888-4888-8888-888888888888')).toBe(
      false,
    );
  });
});
