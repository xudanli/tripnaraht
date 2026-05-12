import { resolveSemanticDeltaPropagationV0 } from './semantic-delta-propagation.stub';

describe('resolveSemanticDeltaPropagationV0', () => {
  it('v0 always requires full rebuild', () => {
    expect(
      resolveSemanticDeltaPropagationV0({
        kind: 'BOOKING_CONFLICT',
        payload: {},
        impact: {
          affectedDomains: ['BOOKING'],
          impactScope: 'GLOBAL',
        },
      }),
    ).toEqual({ mode: 'FULL_REBUILD_REQUIRED' });
  });
});
