import {
  FeatureFlagService,
  FeatureFlagType,
  EvaluationReason,
} from './feature-flags.service';

describe('FeatureFlagService', () => {
  let service: FeatureFlagService;

  beforeEach(() => {
    service = new FeatureFlagService();
  });

  describe('register', () => {
    it('should register a boolean flag', () => {
      const flag = service.register({
        key: 'test.flag',
        name: 'Test Flag',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
      });

      expect(flag.key).toBe('test.flag');
      expect(flag.type).toBe(FeatureFlagType.BOOLEAN);
      expect(flag.enabled).toBe(true);
      expect(flag.createdAt).toBeDefined();
      expect(flag.updatedAt).toBeDefined();
    });

    it('should register a percentage flag', () => {
      const flag = service.register({
        key: 'test.percentage',
        name: 'Percentage Flag',
        type: FeatureFlagType.PERCENTAGE,
        enabled: true,
        percentage: 50,
      });

      expect(flag.percentage).toBe(50);
    });

    it('should register an AB test flag', () => {
      const flag = service.register({
        key: 'test.ab',
        name: 'AB Test',
        type: FeatureFlagType.AB_TEST,
        enabled: true,
        variants: [
          { key: 'control', name: 'Control', weight: 50 },
          { key: 'treatment', name: 'Treatment', weight: 50 },
        ],
      });

      expect(flag.variants).toHaveLength(2);
    });
  });

  describe('update', () => {
    it('should update flag properties', () => {
      service.register({
        key: 'test.update',
        name: 'Original Name',
        type: FeatureFlagType.BOOLEAN,
        enabled: false,
      });

      const updated = service.update('test.update', {
        name: 'Updated Name',
        enabled: true,
      });

      expect(updated).toBeDefined();
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.enabled).toBe(true);
      expect(updated!.key).toBe('test.update');
    });

    it('should return undefined for non-existent flag', () => {
      const result = service.update('non.existent', { enabled: true });
      expect(result).toBeUndefined();
    });
  });

  describe('get and getAll', () => {
    it('should get flag by key', () => {
      service.register({
        key: 'test.get',
        name: 'Test',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
      });

      const flag = service.get('test.get');
      expect(flag).toBeDefined();
      expect(flag!.key).toBe('test.get');
    });

    it('should return undefined for non-existent flag', () => {
      const flag = service.get('non.existent');
      expect(flag).toBeUndefined();
    });

    it('should get all flags including default ones', () => {
      const flags = service.getAll();
      expect(flags.length).toBeGreaterThan(0);
      expect(flags.some(f => f.key === 'decision.monte_carlo_sampling')).toBe(true);
    });
  });

  describe('delete', () => {
    it('should delete flag', () => {
      service.register({
        key: 'test.delete',
        name: 'Test',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
      });

      expect(service.delete('test.delete')).toBe(true);
      expect(service.get('test.delete')).toBeUndefined();
    });

    it('should return false for non-existent flag', () => {
      expect(service.delete('non.existent')).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return true for enabled boolean flag', () => {
      service.register({
        key: 'test.enabled',
        name: 'Test',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
      });

      expect(service.isEnabled('test.enabled')).toBe(true);
    });

    it('should return false for disabled flag', () => {
      service.register({
        key: 'test.disabled',
        name: 'Test',
        type: FeatureFlagType.BOOLEAN,
        enabled: false,
      });

      expect(service.isEnabled('test.disabled')).toBe(false);
    });

    it('should return false for non-existent flag', () => {
      expect(service.isEnabled('non.existent')).toBe(false);
    });
  });

  describe('evaluate - BOOLEAN', () => {
    it('should evaluate boolean flag', () => {
      service.register({
        key: 'test.bool',
        name: 'Test',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
        value: { config: 'value' },
      });

      const result = service.evaluate('test.bool');

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe(EvaluationReason.FLAG_ENABLED);
      expect(result.value).toEqual({ config: 'value' });
    });
  });

  describe('evaluate - PERCENTAGE', () => {
    it('should evaluate percentage flag consistently for same user', () => {
      service.register({
        key: 'test.pct',
        name: 'Test',
        type: FeatureFlagType.PERCENTAGE,
        enabled: true,
        percentage: 50,
      });

      const result1 = service.evaluate('test.pct', { userId: 'user-001' });
      const result2 = service.evaluate('test.pct', { userId: 'user-001' });

      expect(result1.enabled).toBe(result2.enabled);
      expect(result1.reason).toBe(EvaluationReason.PERCENTAGE_ROLLOUT);
    });

    it('should return false for 0% rollout', () => {
      service.register({
        key: 'test.zero',
        name: 'Test',
        type: FeatureFlagType.PERCENTAGE,
        enabled: true,
        percentage: 0,
      });

      const result = service.evaluate('test.zero', { userId: 'any-user' });
      expect(result.enabled).toBe(false);
    });

    it('should return true for 100% rollout', () => {
      service.register({
        key: 'test.full',
        name: 'Test',
        type: FeatureFlagType.PERCENTAGE,
        enabled: true,
        percentage: 100,
      });

      const result = service.evaluate('test.full', { userId: 'any-user' });
      expect(result.enabled).toBe(true);
    });
  });

  describe('evaluate - USER_GROUP', () => {
    beforeEach(() => {
      service.register({
        key: 'test.group',
        name: 'Test',
        type: FeatureFlagType.USER_GROUP,
        enabled: true,
        userGroups: ['beta', 'internal'],
      });
    });

    it('should enable for matching user group', () => {
      const result = service.evaluate('test.group', { userGroups: ['beta'] });

      expect(result.enabled).toBe(true);
      expect(result.reason).toBe(EvaluationReason.USER_GROUP_MATCH);
    });

    it('should disable for non-matching user group', () => {
      const result = service.evaluate('test.group', { userGroups: ['external'] });

      expect(result.enabled).toBe(false);
    });

    it('should disable when no user groups provided', () => {
      const result = service.evaluate('test.group', {});

      expect(result.enabled).toBe(false);
    });
  });

  describe('evaluate - AB_TEST', () => {
    beforeEach(() => {
      service.register({
        key: 'test.ab',
        name: 'Test',
        type: FeatureFlagType.AB_TEST,
        enabled: true,
        variants: [
          { key: 'control', name: 'Control', weight: 50, value: 'control-value' },
          { key: 'treatment', name: 'Treatment', weight: 50, value: 'treatment-value' },
        ],
      });
    });

    it('should assign variant consistently', () => {
      const result1 = service.evaluate('test.ab', { userId: 'user-001' });
      const result2 = service.evaluate('test.ab', { userId: 'user-001' });

      expect(result1.variant).toBe(result2.variant);
      expect(result1.reason).toBe(EvaluationReason.AB_TEST_VARIANT);
    });

    it('should return variant value', () => {
      const result = service.evaluate('test.ab', { userId: 'user-001' });

      expect(result.enabled).toBe(true);
      expect(['control-value', 'treatment-value']).toContain(result.value);
    });

    it('should distribute users across variants', () => {
      const variants = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const result = service.evaluate('test.ab', { userId: `user-${i}` });
        if (result.variant) {
          variants.add(result.variant);
        }
      }

      expect(variants.size).toBe(2);
    });
  });

  describe('dependencies', () => {
    it('should check dependencies before enabling', () => {
      service.register({
        key: 'parent.flag',
        name: 'Parent',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
      });

      service.register({
        key: 'child.flag',
        name: 'Child',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
        dependencies: ['parent.flag'],
      });

      expect(service.isEnabled('child.flag')).toBe(true);
    });

    it('should disable when dependency not met', () => {
      service.register({
        key: 'disabled.parent',
        name: 'Disabled Parent',
        type: FeatureFlagType.BOOLEAN,
        enabled: false,
      });

      service.register({
        key: 'dependent.flag',
        name: 'Dependent',
        type: FeatureFlagType.BOOLEAN,
        enabled: true,
        dependencies: ['disabled.parent'],
      });

      const result = service.evaluate('dependent.flag');

      expect(result.enabled).toBe(false);
      expect(result.reason).toBe(EvaluationReason.DEPENDENCY_NOT_MET);
    });
  });

  describe('AB Test Stats', () => {
    beforeEach(() => {
      service.register({
        key: 'stats.ab',
        name: 'Stats Test',
        type: FeatureFlagType.AB_TEST,
        enabled: true,
        variants: [
          { key: 'A', name: 'A', weight: 50 },
          { key: 'B', name: 'B', weight: 50 },
        ],
      });

      service.evaluate('stats.ab', { userId: 'user-1' });
      service.evaluate('stats.ab', { userId: 'user-2' });
      service.evaluate('stats.ab', { userId: 'user-3' });
    });

    it('should record conversion', () => {
      service.recordABTestConversion('stats.ab', 'user-1', true);
      service.recordABTestConversion('stats.ab', 'user-2', false);

      const stats = service.getABTestStats('stats.ab');

      expect(stats.totalParticipants).toBe(2);
    });

    it('should calculate conversion rate', () => {
      service.recordABTestConversion('stats.ab', 'user-1', true);
      service.recordABTestConversion('stats.ab', 'user-1', true);

      const stats = service.getABTestStats('stats.ab');

      const totalConversions = stats.variants.reduce((sum, v) => sum + v.conversions, 0);
      expect(totalConversions).toBe(2);
    });
  });

  describe('default Decision OS flags', () => {
    it('should register monte carlo sampling flag', () => {
      expect(service.isEnabled('decision.monte_carlo_sampling')).toBe(true);
    });

    it('should register exploration flag', () => {
      expect(service.isEnabled('decision.exploration_enabled')).toBe(true);
    });

    it('should register policy learning flag with percentage', () => {
      const flag = service.get('decision.policy_learning');
      expect(flag).toBeDefined();
      expect(flag!.type).toBe(FeatureFlagType.PERCENTAGE);
      expect(flag!.percentage).toBe(50);
    });

    it('should register optimization algorithm AB test', () => {
      const flag = service.get('decision.optimization_algorithm');
      expect(flag).toBeDefined();
      expect(flag!.type).toBe(FeatureFlagType.AB_TEST);
      expect(flag!.variants).toHaveLength(2);
    });
  });
});
