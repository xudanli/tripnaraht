import { RoutePlanningPolicyConfigService } from './route-planning-policy-config.service';
import { DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS } from './route-planning-policy.defaults';

function embeddedRegistryMock() {
  return {
    resolveActiveBundle: jest.fn().mockReturnValue({
      bundle: {
        id: 'embedded-default',
        revision: DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS.revision,
        parameters: { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS },
        policyDeclarations: [] as const,
      },
      selectionReason: 'embedded_default' as const,
    }),
  };
}

describe('RoutePlanningPolicyConfigService', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('returns defaults when no external config', () => {
    const nestConfig = {
      get: jest.fn().mockReturnValue(undefined),
    };
    const svc = new RoutePlanningPolicyConfigService(nestConfig as any, embeddedRegistryMock() as any);
    const active = svc.getActiveParameters();
    expect(active.params.softStackCap).toBe(DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS.softStackCap);
    expect(active.sources).toContain('default');
    expect(active.sources.some((s) => s.startsWith('registry:'))).toBe(true);
    expect(active.activeBundleId).toBe('embedded-default');
  });

  it('merges ROUTE_PLANNING_POLICY_JSON', () => {
    process.env.ROUTE_PLANNING_POLICY_JSON = JSON.stringify({
      revision: 'test/v2',
      softStackCap: 2,
    });
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'ROUTE_PLANNING_POLICY_JSON' ? process.env.ROUTE_PLANNING_POLICY_JSON : undefined)),
    };
    const svc = new RoutePlanningPolicyConfigService(nestConfig as any, embeddedRegistryMock() as any);
    const active = svc.getActiveParameters();
    expect(active.revision).toBe('test/v2');
    expect(active.params.softStackCap).toBe(2);
    expect(active.sources.some((s) => s.includes('ROUTE_PLANNING_POLICY_JSON'))).toBe(true);
  });

  it('merges registry bundle before JSON override', () => {
    const registry = {
      resolveActiveBundle: jest.fn().mockReturnValue({
        bundle: {
          id: 'custom-bundle',
          revision: 'reg/v1',
          parameters: {
            ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS,
            revision: 'reg/v1',
            softStackCap: 7,
          },
          policyDeclarations: [],
        },
        selectionReason: 'registry_fallback_first' as const,
      }),
    };
    process.env.ROUTE_PLANNING_POLICY_JSON = JSON.stringify({ softStackCap: 2 });
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'ROUTE_PLANNING_POLICY_JSON' ? process.env.ROUTE_PLANNING_POLICY_JSON : undefined)),
    };
    const svc = new RoutePlanningPolicyConfigService(nestConfig as any, registry as any);
    const active = svc.getActiveParameters();
    expect(active.activeBundleId).toBe('custom-bundle');
    expect(active.params.softStackCap).toBe(2);
  });
});
