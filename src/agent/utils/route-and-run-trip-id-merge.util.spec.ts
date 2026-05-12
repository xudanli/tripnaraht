import { mergeTripIdAliasesIntoRouteAndRunRequest } from './route-and-run-trip-id-merge.util';
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
});
