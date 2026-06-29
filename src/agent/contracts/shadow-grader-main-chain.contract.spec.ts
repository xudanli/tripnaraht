/**
 * Shadow Grader P3 主链契约：env SSOT + observability slice。
 */
import { buildShadowGraderObservabilitySlice } from '../training/utils/shadow-grader-observability.util';
import { parseHarnessShadowGraderEnabled } from '../training/utils/harness-shadow-grader-mode.util';

describe('shadow grader main chain contract', () => {
  it('HARNESS_SHADOW_GRADER enables grader', () => {
    expect(parseHarnessShadowGraderEnabled({ HARNESS_SHADOW_GRADER: '1' })).toBe(true);
  });

  it('observability slice uses tripnara.shadow_grader@v1', () => {
    const slice = buildShadowGraderObservabilitySlice({
      requestId: 'r1',
      activeShadowVersion: null,
    });
    expect(slice.schemaId).toBe('tripnara.shadow_grader@v1');
    expect(slice.enabled).toBe(false);
  });
});
