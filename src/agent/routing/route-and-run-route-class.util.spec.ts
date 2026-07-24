import { classifyRouteAndRunRouteClass } from './route-and-run-route-class.util';
import { ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES } from './route-and-run-golden-eval-fixtures';

describe('route-and-run golden eval (routing protocol SSOT)', () => {
  it('has at least 28 fixtures', () => {
    expect(ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.length).toBeGreaterThanOrEqual(28);
  });

  describe.each(ROUTE_AND_RUN_GOLDEN_EVAL_FIXTURES.map((fx) => [fx.id, fx] as const))(
    '%s',
    (_id, fx) => {
      it(`routeClass = ${fx.expected.routeClass}`, () => {
        const decision = classifyRouteAndRunRouteClass(fx.request);
        expect(decision.routeClass).toBe(fx.expected.routeClass);
      });

      it('trip_id requirement', () => {
        const decision = classifyRouteAndRunRouteClass(fx.request);
        const hasTrip = Boolean(fx.request.trip_id?.trim());
        if (fx.expected.tripId === 'required') {
          expect(hasTrip).toBe(true);
        }
        if (fx.expected.tripId === 'none') {
          expect(decision.tripId).toBe('none');
        }
      });

      it('clarification / write flags', () => {
        const decision = classifyRouteAndRunRouteClass(fx.request);
        expect(decision.needsClarificationBeforeWrite).toBe(
          fx.expected.needsClarificationBeforeWrite,
        );
        expect(decision.allowsDirectItineraryWrite).toBe(fx.expected.allowsDirectItineraryWrite);
      });

      it('deep research V7.1 trigger', () => {
        const decision = classifyRouteAndRunRouteClass(fx.request);
        expect(decision.deepResearchV71).toBe(fx.expected.deepResearchV71);
      });
    },
  );
});
