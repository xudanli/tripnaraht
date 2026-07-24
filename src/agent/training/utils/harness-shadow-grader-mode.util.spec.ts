import {
  parseHarnessShadowGraderEnabled,
  parseShadowGraderLogEveryN,
} from './harness-shadow-grader-mode.util';

describe('harness-shadow-grader-mode.util', () => {
  it('prefers HARNESS_SHADOW_GRADER over legacy env', () => {
    expect(parseHarnessShadowGraderEnabled({ HARNESS_SHADOW_GRADER: '1' })).toBe(true);
    expect(parseHarnessShadowGraderEnabled({ HARNESS_SHADOW_GRADER: '0', SHADOW_GRADER_ENABLED: '1' })).toBe(
      false,
    );
    expect(parseHarnessShadowGraderEnabled({ SHADOW_GRADER_ENABLED: 'true' })).toBe(true);
  });

  it('parses log every N', () => {
    expect(parseShadowGraderLogEveryN({ HARNESS_SHADOW_GRADER_LOG_EVERY_N: '50' })).toBe(50);
  });
});
