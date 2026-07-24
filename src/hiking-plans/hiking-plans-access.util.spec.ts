import { canAccessHikePlan } from './hiking-plans-access.util';

describe('canAccessHikePlan', () => {
  const plan = { userId: 'captain', tripId: 'trip-1' };

  it('allows owner', () => {
    expect(canAccessHikePlan(plan, 'captain', false)).toBe(true);
  });

  it('allows trip collaborator on linked plan', () => {
    expect(canAccessHikePlan(plan, 'member', true)).toBe(true);
  });

  it('denies unrelated user', () => {
    expect(canAccessHikePlan(plan, 'stranger', false)).toBe(false);
  });

  it('denies collaborator when plan has no tripId', () => {
    expect(canAccessHikePlan({ userId: 'captain', tripId: null }, 'member', true)).toBe(false);
  });
});
