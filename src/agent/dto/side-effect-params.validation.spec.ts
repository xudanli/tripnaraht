import { FINANCIAL_HOLD_HANDLER_ID } from './financial-hold-side-effect-params.dto';
import { assertFinancialHoldParams, assertSideEffectParamsForHandler, assertSideEffectOverridesTree } from './side-effect-params.validation';

describe('side-effect-params.validation', () => {
  it('rejects extra keys for financial hold', () => {
    const r = assertSideEffectParamsForHandler(FINANCIAL_HOLD_HANDLER_ID, { ttl_seconds: 1, _hack: 1 });
    expect(r.ok).toBe(false);
  });

  it('accepts only known keys and optional subset', () => {
    expect(assertFinancialHoldParams({})).toEqual({ ok: true });
    expect(assertSideEffectParamsForHandler(FINANCIAL_HOLD_HANDLER_ID, { ttl_seconds: 60, hold_ratio: 0.5 })).toEqual({ ok: true });
  });

  it('other handler id allows free-form object', () => {
    expect(assertSideEffectParamsForHandler('h_one', { hold_ratio: 0.15 })).toEqual({ ok: true });
  });

  it('validates replace tree for nested financial hold', () => {
    const r = assertSideEffectOverridesTree({
      'trip.apply_user_edit': {
        [FINANCIAL_HOLD_HANDLER_ID]: { hold_ratio: 2 },
      },
    });
    expect(r.ok).toBe(false);
  });
});
