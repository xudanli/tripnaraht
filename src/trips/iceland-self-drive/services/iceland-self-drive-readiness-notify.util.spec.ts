import {
  parseIsdContextVersionNumber,
  stampReadinessInvalidationOnMeta,
} from './iceland-self-drive-readiness-notify.util';
import { OVERALL_READINESS_CACHE_KEY } from '../../overall-readiness/utils/overall-readiness-cache.util';

describe('iceland-self-drive-readiness-notify.util', () => {
  it('parses cv_N context versions', () => {
    expect(parseIsdContextVersionNumber('cv_12')).toBe(12);
    expect(parseIsdContextVersionNumber(7)).toBe(7);
  });

  it('clears cache and bumps readiness contextVersion', () => {
    const meta: Record<string, unknown> = {
      [OVERALL_READINESS_CACHE_KEY]: { score: 1 },
      selfDriveReadiness: { contextVersion: 3 },
    };
    const next = stampReadinessInvalidationOnMeta(meta, 'cv_10');
    expect(next).toBe(10);
    expect(meta[OVERALL_READINESS_CACHE_KEY]).toBeUndefined();
    expect(
      (meta.selfDriveReadiness as { contextVersion: number }).contextVersion,
    ).toBe(10);
  });
});
