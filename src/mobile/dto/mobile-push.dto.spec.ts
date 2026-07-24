import { MOBILE_PUSH_PLATFORMS } from '../dto/mobile-push.dto';

describe('mobile-push.dto', () => {
  it('defines ios and android platforms', () => {
    expect(MOBILE_PUSH_PLATFORMS).toContain('ios');
    expect(MOBILE_PUSH_PLATFORMS).toContain('android');
  });
});
