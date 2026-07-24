import { resolveDeliveryVerdict } from './delivery-verdict.types';

describe('resolveDeliveryVerdict', () => {
  it('maps FAILED / TIMEOUT', () => {
    expect(resolveDeliveryVerdict({ resultStatus: 'FAILED' })).toBe('FAILED');
    expect(resolveDeliveryVerdict({ resultStatus: 'TIMEOUT' })).toBe('FAILED');
  });

  it('maps NEED_* and BLOCKED to BLOCKED', () => {
    expect(resolveDeliveryVerdict({ resultStatus: 'BLOCKED' })).toBe('BLOCKED');
    expect(resolveDeliveryVerdict({ resultStatus: 'NEED_MORE_INFO' })).toBe('BLOCKED');
    expect(resolveDeliveryVerdict({ resultStatus: 'NEED_CONFIRMATION' })).toBe('BLOCKED');
  });

  it('maps flawed draft ahead of OK', () => {
    expect(
      resolveDeliveryVerdict({
        resultStatus: 'OK',
        flawedDraft: {
          schemaId: 'tripnara.flawed_draft@v1',
          version: 1,
          is_flawed: true,
          reasons: [],
          user_action_recommended: true,
        },
      }),
    ).toBe('FLAWED_DRAFT');
  });

  it('maps OK with soft warnings', () => {
    expect(
      resolveDeliveryVerdict({ resultStatus: 'OK', hasSoftWarnings: true }),
    ).toBe('VERIFIED_WITH_WARNINGS');
  });

  it('maps clean OK to VERIFIED', () => {
    expect(resolveDeliveryVerdict({ resultStatus: 'OK' })).toBe('VERIFIED');
  });
});
