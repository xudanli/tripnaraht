import {
  bundleNeedsInspector,
  resolveBundleModules,
} from './decision-space-bundle.surface.util';

describe('decision-space-bundle.surface.util', () => {
  it('default surface includes feasibility not causalChain', () => {
    const { included, deferred } = resolveBundleModules({ surface: 'default' });
    expect(included).toEqual(
      expect.arrayContaining([
        'problem',
        'basis',
        'pack.summary',
        'inspector.feasibility',
        'orchestration',
      ]),
    );
    expect(included).not.toContain('inspector.causalChain');
    expect(deferred).toContain('inspector.causalChain');
  });

  it('include overrides surface preset', () => {
    const { included } = resolveBundleModules({
      surface: 'default',
      include: 'inspector.planDiff',
    });
    expect(included).toEqual(['inspector.planDiff']);
  });

  it('pack.full replaces pack.summary', () => {
    const { included } = resolveBundleModules({ surface: 'middle' });
    expect(included).toContain('pack.full');
    expect(included).not.toContain('pack.summary');
  });

  it('inspector.basis drops standalone basis', () => {
    const { included } = resolveBundleModules({
      include: 'inspector.basis,problem',
    });
    expect(included).toContain('inspector.basis');
    expect(included).not.toContain('basis');
  });

  it('bundleNeedsInspector detects inspector modules', () => {
    expect(bundleNeedsInspector(['inspector.planDiff'])).toBe(true);
    expect(bundleNeedsInspector(['problem'])).toBe(false);
  });
});
