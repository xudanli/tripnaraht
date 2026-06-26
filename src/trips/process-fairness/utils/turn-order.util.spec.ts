import {
  allMembersSpoken,
  currentSpeakerUserId,
  parseTurnOrder,
  shuffleTurnOrder,
} from './turn-order.util';

describe('turn-order.util', () => {
  it('shuffles without losing members', () => {
    const members = ['a', 'b', 'c'];
    const order = shuffleTurnOrder(members);
    expect(order.sort()).toEqual(members.sort());
  });

  it('returns current speaker during collecting phase', () => {
    const order = ['u1', 'u2', 'u3'];
    expect(currentSpeakerUserId(order, 0, 'collecting')).toBe('u1');
    expect(currentSpeakerUserId(order, 2, 'collecting')).toBe('u3');
    expect(currentSpeakerUserId(order, 0, 'synthesizing')).toBeNull();
  });

  it('detects when all members have spoken', () => {
    expect(allMembersSpoken(['a', 'b'], 2)).toBe(true);
    expect(allMembersSpoken(['a', 'b'], 1)).toBe(false);
  });

  it('parses turn order from JSON', () => {
    expect(parseTurnOrder(['a', 'b'])).toEqual(['a', 'b']);
    expect(parseTurnOrder(null)).toEqual([]);
  });
});
