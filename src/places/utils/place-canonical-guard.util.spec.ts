import {
  assertPlaceCanonicalTypeAllowed,
  extractCanonicalTypeFromMetadata,
  PlaceProductCanonicalBlockedError,
} from './place-canonical-guard.util';
import { IcelandCanonicalType } from '../types/iceland-poi-categories';

describe('place-canonical-guard', () => {
  it('allows geographic canonical types', () => {
    expect(() =>
      assertPlaceCanonicalTypeAllowed({
        canonicalType: IcelandCanonicalType.ATTRACTION_NATURE_GLACIER,
      }),
    ).not.toThrow();
  });

  it('blocks glacier walk product types', () => {
    expect(() =>
      assertPlaceCanonicalTypeAllowed({
        canonicalType: IcelandCanonicalType.GLACIER_WALK,
      }),
    ).toThrow(PlaceProductCanonicalBlockedError);
  });

  it('extracts canonicalType from metadata', () => {
    expect(
      extractCanonicalTypeFromMetadata({ canonicalType: 'WHALE_WATCHING' }),
    ).toBe('WHALE_WATCHING');
    expect(extractCanonicalTypeFromMetadata(null)).toBeUndefined();
  });
});
