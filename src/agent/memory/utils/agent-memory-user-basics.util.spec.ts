import { extractAgentMemoryUserBasicsFromPreferences } from './agent-memory-user-basics.util';

describe('agent-memory-user-basics.util', () => {
  it('returns null for empty / non-object preferences', () => {
    expect(extractAgentMemoryUserBasicsFromPreferences(null)).toBeNull();
    expect(extractAgentMemoryUserBasicsFromPreferences([])).toBeNull();
    expect(extractAgentMemoryUserBasicsFromPreferences({})).toBeNull();
  });

  it('extracts nationality, tags, attraction types and audit timestamp', () => {
    const prefs = {
      nationality: 'cn',
      residencyCountry: 'GB',
      tags: ['solo', ' '],
      preferredAttractionTypes: ['MUSEUM', 'NATURE'],
      dietaryRestrictions: ['VEGETARIAN'],
    };
    const b = extractAgentMemoryUserBasicsFromPreferences(prefs, '2026-01-02T00:00:00.000Z');
    expect(b).toMatchObject({
      nationality: 'CN',
      residencyCountry: 'GB',
      tags: ['solo'],
      preferredAttractionTypes: ['MUSEUM', 'NATURE'],
      dietaryRestrictions: ['VEGETARIAN'],
      profilePreferencesUpdatedAt: '2026-01-02T00:00:00.000Z',
    });
    expect(Object.isFrozen(b)).toBe(true);
  });
});
