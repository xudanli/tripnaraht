import { decisionRuleRowsToOverrideMap } from './side-effect-rule-syncer.service';

describe('decisionRuleRowsToOverrideMap', () => {
  it('groups rows by actionName and handlerId', () => {
    const map = decisionRuleRowsToOverrideMap([
      { actionName: 'trip.apply_user_edit', handlerId: 'side_effect.financial_hold.book_flight_v1', params: { hold_ratio: 0.1 } },
      { actionName: 'trip.apply_user_edit', handlerId: 'side_effect.financial_hold.book_flight_v1', params: { ttl_seconds: 120 } },
    ]);
    expect(map['trip.apply_user_edit']['side_effect.financial_hold.book_flight_v1']).toEqual({ ttl_seconds: 120 });
  });

  it('tolerates non-object params as empty object', () => {
    const map = decisionRuleRowsToOverrideMap([
      { actionName: 'a', handlerId: 'h', params: null as any },
    ]);
    expect(map.a.h).toEqual({});
  });
});
