import { normalizeFliggyPhotoUrl } from './fliggy-photo-url.util';

describe('normalizeFliggyPhotoUrl', () => {
  it('encodes !! in alicdn path', () => {
    const out = normalizeFliggyPhotoUrl(
      'https://img.alicdn.com/imgextra/i2/O1CN01Yym6tR2DS3n6tVE73_!!0-alitrip.jpg',
    );
    expect(out).toContain('%21%21');
    expect(out).not.toContain('!!');
    expect(out?.startsWith('https://')).toBe(true);
  });

  it('upgrades protocol-relative URLs', () => {
    expect(normalizeFliggyPhotoUrl('//img.alicdn.com/a.jpg')).toBe(
      'https://img.alicdn.com/a.jpg',
    );
  });
});
