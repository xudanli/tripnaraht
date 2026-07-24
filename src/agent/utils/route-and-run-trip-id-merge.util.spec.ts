import {
  isAcceptableRouteAndRunTripId,
  isCanonicalRouteAndRunTripIdForm,
  mergeTripIdAliasesIntoRouteAndRunRequest,
} from './route-and-run-trip-id-merge.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';

describe('mergeTripIdAliasesIntoRouteAndRunRequest', () => {
  it('fills trip_id from tripId', () => {
    const req = {
      tripId: ' t1 ',
      user_id: 'u',
      request_id: 'r',
      message: 'm',
    } as RouteAndRunRequestDto;
    mergeTripIdAliasesIntoRouteAndRunRequest(req);
    expect(req.trip_id).toBe('t1');
  });

  it('fills trip_id from suggested_operation_payload when top missing', () => {
    const req = {
      user_id: 'u',
      request_id: 'r',
      message: 'm',
      suggested_operation_payload: { trip_id: ' t2 ' },
    } as RouteAndRunRequestDto;
    mergeTripIdAliasesIntoRouteAndRunRequest(req);
    expect(req.trip_id).toBe('t2');
  });

  it('prefers top-level trip_id over nested', () => {
    const req = {
      trip_id: 'top',
      suggested_operation_payload: { trip_id: 'nested' },
      user_id: 'u',
      request_id: 'r',
      message: 'm',
    } as RouteAndRunRequestDto;
    mergeTripIdAliasesIntoRouteAndRunRequest(req);
    expect(req.trip_id).toBe('top');
  });

  it('accepts UUID and trip_<hex> as canonical forms (not placeholders)', () => {
    expect(isCanonicalRouteAndRunTripIdForm('15c50a69-9318-45ca-8a4c-5ee66553209f')).toBe(true);
    expect(isCanonicalRouteAndRunTripIdForm('trip_15c50a69931845ca')).toBe(true);
    expect(isAcceptableRouteAndRunTripId('trip_15c50a69931845ca')).toBe(true);
    expect(isAcceptableRouteAndRunTripId('')).toBe(false);
  });

  it('merges shell trip_id unchanged', () => {
    const req = {
      tripId: 'trip_15c50a69931845ca',
      user_id: 'u',
      request_id: 'r',
      message: 'm',
    } as RouteAndRunRequestDto;
    mergeTripIdAliasesIntoRouteAndRunRequest(req);
    expect(req.trip_id).toBe('trip_15c50a69931845ca');
  });
});
