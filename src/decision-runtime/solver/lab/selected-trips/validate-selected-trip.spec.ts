import { join } from 'path';
import { PACKS_ROOT, validateSelectedTripPack } from './validate-selected-trip';

describe('validateSelectedTripPack', () => {
  it('accepts exported gold staging pack', () => {
    const dir = join(
      PACKS_ROOT,
      'pilot_iceland_road_close_01_f208_reroute_a1_a2',
    );
    const report = validateSelectedTripPack(dir);
    expect(report.ok).toBe(true);
    expect(report.intendedOperation).toBe('REROUTE');
  });
});
