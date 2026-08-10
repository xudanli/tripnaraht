import { BadRequestException } from '@nestjs/common';
import {
  LATENT_SHADOW_WRITE_FORBIDDEN_CODE,
  refuseLatentShadowPlanMutation,
  runLatentImplicitParseShadow,
  isLatentImplicitParseShadowEnabled,
} from './index';

describe('travel-latent-shadow (Shadow research)', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  it('defaults to disabled when env unset', () => {
    delete process.env.LATENT_IMPLICIT_PARSE_SHADOW;
    delete process.env.LATENT_IMPLICIT_PARSE_KILL_SWITCH;
    expect(isLatentImplicitParseShadowEnabled()).toBe(false);
    const report = runLatentImplicitParseShadow({ tripId: 't1' });
    expect(report.enabled).toBe(false);
    expect(report.mustNotWritePlan).toBe(true);
    expect(report.authority).toBe('SHADOW_ONLY');
    expect(report.hypotheses).toHaveLength(0);
  });

  it('produces heuristic hypotheses when Shadow enabled', () => {
    process.env.LATENT_IMPLICIT_PARSE_SHADOW = '1';
    delete process.env.LATENT_IMPLICIT_PARSE_KILL_SWITCH;
    const report = runLatentImplicitParseShadow({
      tripId: 't_is',
      signals: { weatherProhibitsOutdoor: 'ACTIVITY_PROHIBITED' },
      factRefs: [
        { factId: 'f1', predicate: 'weather.warning' },
        { factId: 'f2', predicate: 'route.exposure' },
      ],
      explicitBaseline: {
        source: 'RULE_CAUSAL',
        summary: 'Strong wind reduces speed; miss probability elevated.',
      },
    });
    expect(report.enabled).toBe(true);
    expect(report.hypotheses.length).toBeGreaterThan(0);
    expect(report.hypotheses.every((h) => h.method === 'HEURISTIC_PLACEHOLDER')).toBe(
      true,
    );
    expect(report.divergence?.compared).toBe(true);
  });

  it('kill switch forces disabled even when Shadow env on', () => {
    process.env.LATENT_IMPLICIT_PARSE_SHADOW = '1';
    process.env.LATENT_IMPLICIT_PARSE_KILL_SWITCH = '1';
    expect(isLatentImplicitParseShadowEnabled()).toBe(false);
  });

  it('refuses plan mutation attempts', () => {
    expect(() =>
      refuseLatentShadowPlanMutation({
        caller: 'latent-shadow.test',
        attemptsPlanWrite: true,
      }),
    ).toThrow(BadRequestException);
    try {
      refuseLatentShadowPlanMutation({
        caller: 'latent-shadow.test',
        attemptsPlanWrite: true,
      });
    } catch (e) {
      const body = (e as BadRequestException).getResponse() as { code?: string };
      expect(body.code).toBe(LATENT_SHADOW_WRITE_FORBIDDEN_CODE);
    }
  });
});
