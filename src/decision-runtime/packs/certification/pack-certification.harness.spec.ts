import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  runPackCertification,
  validateCountryPackRules,
  validateCountryPackModifiers,
  type PackCertificationScenario,
} from './pack-certification.harness';
import { loadRoadRepairTemplatesForCountry } from '../repair/road-repair-template.loader';

function loadIsRoadScenarios(): PackCertificationScenario[] {
  const path = join(
    process.cwd(),
    'data/destination-packs/is/certification/road-close.scenarios.json',
  );
  return JSON.parse(readFileSync(path, 'utf8')) as PackCertificationScenario[];
}

describe('pack-certification.harness (CERT)', () => {
  it('CERT-001: IS pack loads road + weather + activity + load rules', () => {
    const summary = validateCountryPackRules('IS');
    expect(summary.ruleCount).toBeGreaterThanOrEqual(6);
    expect(summary.ruleIds).toContain('IS_ROAD_CLOSED_BLOCK');
    expect(summary.ruleIds).toContain('IS_WEATHER_HIGH_WIND_BLOCK');
    expect(summary.ruleIds).toContain('IS_ACTIVITY_GLACIER_GUIDE_REQUIRED');
    expect(summary.ruleIds).toContain('IS_DAILY_LOAD_EXCESSIVE_BLOCK');
  });

  it('CERT-005: IS pack loads driving + outdoor environment modifiers', () => {
    const summary = validateCountryPackModifiers('IS');
    expect(summary.modifierCount).toBeGreaterThanOrEqual(2);
    expect(summary.modifierIds).toContain('IS_DRIVING_ENVIRONMENT');
    expect(summary.modifierIds).toContain('IS_OUTDOOR_LOAD');
    expect(summary.drivingEnvironment.baseSafeHours).toBe(7);
    expect(summary.activityLoad.windExposureMultiplier).toBe(1.15);
    expect(summary.effectiveDailyLoadThresholdHours).toBeCloseTo(6.364, 3);
    expect(
      existsSync(join(process.cwd(), 'data/destination-packs/is/modifiers/is-driving-load.json')),
    ).toBe(true);
  });

  it('CERT-006: IS pack loads road repair templates', () => {
    const bundle = loadRoadRepairTemplatesForCountry('IS');
    expect(bundle?.templates.length).toBeGreaterThanOrEqual(4);
  });

  it('CERT-002: golden IS road scenarios all pass', () => {
    const report = runPackCertification(loadIsRoadScenarios(), {
      forcePackRules: true,
    });
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(report.total);
  });

  it('CERT-003: golden IS weather scenarios pass', () => {
    const path = join(
      process.cwd(),
      'data/destination-packs/is/certification/weather-activity.scenarios.json',
    );
    const scenarios = JSON.parse(
      readFileSync(path, 'utf8'),
    ) as PackCertificationScenario[];
    const report = runPackCertification(scenarios, { forcePackRules: true });
    expect(report.failed).toBe(0);
  });

  it('CERT-004: golden IS excessive daily load scenarios pass', () => {
    const path = join(
      process.cwd(),
      'data/destination-packs/is/certification/excessive-daily-load.scenarios.json',
    );
    const scenarios = JSON.parse(
      readFileSync(path, 'utf8'),
    ) as PackCertificationScenario[];
    const report = runPackCertification(scenarios, { forcePackRules: true });
    expect(report.failed).toBe(0);
    expect(report.passed).toBe(3);
  });
});
