import { TRIPNARA_STRUCTURED_PREFERENCES } from '../services/user-standing-preference.service';
import { extractTripnaraStructuredSlicesFromPreferences } from './tripnara-structured-preferences-context.util';

describe('extractTripnaraStructuredSlicesFromPreferences', () => {
  it('reads nested tripnara_structured_preferences', () => {
    const slices = extractTripnaraStructuredSlicesFromPreferences({
      [TRIPNARA_STRUCTURED_PREFERENCES]: {
        hotel_style: '极简暗黑',
        hotel_avoid: ['连锁', 'Marriott'],
      },
    });
    expect(slices.standing_hotel_style_digest_zh).toContain('极简暗黑');
    expect(slices.standing_hotel_avoid_terms_lower).toEqual(expect.arrayContaining(['连锁', 'marriott']));
    expect(slices.rag_query_bias_zh).toContain('用户长期偏好');
  });

  it('accepts flat structured object', () => {
    const slices = extractTripnaraStructuredSlicesFromPreferences({
      hotel_style: '民宿优先',
      hotel_avoid: [],
    } as Record<string, unknown>);
    expect(slices.standing_hotel_style_digest_zh).toContain('民宿优先');
  });
});
