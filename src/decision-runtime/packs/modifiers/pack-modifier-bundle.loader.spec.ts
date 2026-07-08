import {
  listCountryDrivingModifierIds,
  listGlobalDrivingModifierIds,
  loadCountryPackModifiers,
  loadGlobalPackModifiers,
  loadMergedPackModifiers,
  loadModifierBundleFromPath,
  resolveActivityLoadEnvironmentForCountry,
  resolveDrivingEnvironmentForCountry,
  resolveEffectiveDailyLoadThresholdForCountry,
} from './pack-modifier-bundle.loader';

describe('pack-modifier-bundle.loader', () => {
  const prevRuntime = process.env.DECISION_PACK_RUNTIME;

  afterEach(() => {
    if (prevRuntime === undefined) delete process.env.DECISION_PACK_RUNTIME;
    else process.env.DECISION_PACK_RUNTIME = prevRuntime;
  });

  it('MOD-001: loads IS driving modifier bundle from manifest', () => {
    const modifiers = loadCountryPackModifiers('IS');
    expect(modifiers.some((m) => m.modifierId === 'IS_DRIVING_ENVIRONMENT')).toBe(true);
    expect(modifiers.some((m) => m.modifierId === 'IS_OUTDOOR_LOAD')).toBe(true);
  });

  it('MOD-002: resolveDrivingEnvironment uses IS pack when runtime enabled', () => {
    process.env.DECISION_PACK_RUNTIME = '1';
    const env = resolveDrivingEnvironmentForCountry('IS');
    expect(env.baseSafeHours).toBe(7);
    expect(env.defaultSpeedKmH).toBe(65);
  });

  it('MOD-003: falls back to code defaults when runtime disabled', () => {
    process.env.DECISION_PACK_RUNTIME = '0';
    const env = resolveDrivingEnvironmentForCountry('IS');
    expect(env.baseSafeHours).toBe(8);
  });

  it('MOD-004: lists driving modifier ids for certification', () => {
    const ids = listCountryDrivingModifierIds('IS');
    expect(ids).toContain('IS_DRIVING_ENVIRONMENT');
    expect(ids).toContain('GLOBAL_DRIVING_BASELINE');
  });

  it('MOD-005: loadModifierBundleFromPath validates schema', () => {
    const bundle = loadModifierBundleFromPath(
      `${process.cwd()}/data/destination-packs/is/modifiers/is-driving.json`,
    );
    expect(bundle.schemaId).toBe('tripnara.environment.modifiers@v1');
    expect(bundle.modifiers[0].parameters.baseSafeHours).toBe(7);
  });

  it('MOD-006: JP trip uses global driving baseline overlay', () => {
    process.env.DECISION_PACK_RUNTIME = '1';
    expect(listGlobalDrivingModifierIds()).toContain('GLOBAL_DRIVING_BASELINE');
    const env = resolveDrivingEnvironmentForCountry('JP');
    expect(env.baseSafeHours).toBe(8);
    expect(env.defaultSpeedKmH).toBe(50);
  });

  it('MOD-007: IS overlays global driving params (country wins)', () => {
    process.env.DECISION_PACK_RUNTIME = '1';
    const merged = loadMergedPackModifiers('IS');
    expect(merged.some((m) => m.modifierId === 'GLOBAL_DRIVING_BASELINE')).toBe(true);
    expect(merged.some((m) => m.modifierId === 'IS_DRIVING_ENVIRONMENT')).toBe(true);
    expect(resolveDrivingEnvironmentForCountry('IS').baseSafeHours).toBe(7);
  });

  it('MOD-008: IS outdoor load modifier resolves activity params', () => {
    process.env.DECISION_PACK_RUNTIME = '1';
    const activity = resolveActivityLoadEnvironmentForCountry('IS');
    expect(activity.windExposureMultiplier).toBe(1.15);
    expect(activity.highlandFatigueFactor).toBe(1.1);
    expect(resolveEffectiveDailyLoadThresholdForCountry('IS')).toBeCloseTo(6.364, 3);
  });

  it('MOD-009: loadGlobalPackModifiers reads global manifest', () => {
    const global = loadGlobalPackModifiers();
    expect(global.some((m) => m.modifierId === 'GLOBAL_DRIVING_BASELINE')).toBe(true);
  });
});
