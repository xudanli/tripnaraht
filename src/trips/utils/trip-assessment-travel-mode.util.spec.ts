import { TravelMode } from '../dto/trip-intent.dto';
import {
  buildTravelSegmentMap,
  resolveItemTravelMinutes,
  resolveTripAssessmentTravelMode,
} from './trip-assessment-travel-mode.util';

describe('trip-assessment-travel-mode.util', () => {
  it('infers DRIVING from transport car', () => {
    expect(resolveTripAssessmentTravelMode({ transport: 'car' })).toBe(TravelMode.DRIVING);
  });

  it('prefers request override', () => {
    expect(
      resolveTripAssessmentTravelMode({ transport: 'car' }, TravelMode.PUBLIC_TRANSIT),
    ).toBe(TravelMode.PUBLIC_TRANSIT);
  });

  it('uses travel-info segment over DB duration', () => {
    const map = buildTravelSegmentMap([
      { toItemId: 'a', duration: 18, distance: 18244, travelMode: 'DRIVING' },
    ]);
    expect(resolveItemTravelMinutes({ id: 'a', travelFromPreviousDuration: 219 }, map)).toBe(18);
    expect(resolveItemTravelMinutes({ id: 'b', travelFromPreviousDuration: 30 }, map)).toBe(30);
  });
});
