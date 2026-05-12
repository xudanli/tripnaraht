import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import { resolveRouteRunPartyProfileSnapshot } from './route-and-run-party-profile.util';

describe('resolveRouteRunPartyProfileSnapshot', () => {
  it('merges structured then top-level party_profile', () => {
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'hi',
      structured_travel_input: {
        party_profile: { fitness_level: 'medium', has_children: true },
      },
      party_profile: { fitness_level: 'high' },
    } as RouteAndRunRequestDto;
    const s = resolveRouteRunPartyProfileSnapshot(req);
    expect(s?.fitness_level).toBe('high');
    expect(s?.has_children).toBe(true);
  });

  it('top-level fitness_level overrides nested', () => {
    const req = {
      request_id: 'r1',
      user_id: 'u1',
      message: 'hi',
      party_profile: { fitness_level: 'medium' },
      fitness_level: 'low',
    } as RouteAndRunRequestDto;
    expect(resolveRouteRunPartyProfileSnapshot(req)?.fitness_level).toBe('low');
  });

  it('returns null when nothing provided', () => {
    const req = { request_id: 'r1', user_id: 'u1', message: 'x' } as RouteAndRunRequestDto;
    expect(resolveRouteRunPartyProfileSnapshot(req)).toBeNull();
  });
});
