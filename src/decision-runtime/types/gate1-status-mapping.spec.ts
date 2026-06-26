import { suggestTripStatusForGate1, GATE1_TO_TRIP_STATUS } from './gate1-status-mapping';
import { TripStatus } from '../../trips/dto/trip-status.dto';

describe('gate1-status-mapping', () => {
  it('maps Gate1 READY to Trip PLANNING (not a TripStatus READY)', () => {
    expect(suggestTripStatusForGate1('READY')).toBe(TripStatus.PLANNING);
  });

  it('maps ACTIVE to TRAVELING', () => {
    expect(suggestTripStatusForGate1('ACTIVE')).toBe(TripStatus.TRAVELING);
  });

  it('covers all Gate1 experiment statuses', () => {
    expect(Object.keys(GATE1_TO_TRIP_STATUS)).toHaveLength(9);
  });
});
