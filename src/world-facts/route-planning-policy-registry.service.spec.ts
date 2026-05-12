import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { ExecutionPlanningContext } from './execution-planning-context.types';
import { DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS } from './route-planning-policy.defaults';
import { RoutePlanningPolicyRegistryService } from './route-planning-policy-registry.service';

describe('RoutePlanningPolicyRegistryService', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const minimalCtx = (
    partial: Partial<ExecutionPlanningContext>,
  ): ExecutionPlanningContext =>
    ({
      countryCode: 'IS',
      tripExecutionHistory: [],
      hints: {
        routeDegradeCountByRouteDirectionId: {},
        ambientDegradeEvents: 0,
      },
      ...partial,
    }) as ExecutionPlanningContext;

  function writeRegistry(data: object) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-reg-'));
    const p = path.join(tmpDir, 'registry.json');
    fs.writeFileSync(p, JSON.stringify(data), 'utf8');
    return p;
  }

  it('uses embedded default when registry file is missing', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'policy-reg-empty-'));
    const missingPath = path.join(tmpDir, 'nope.json');
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'POLICY_REGISTRY_FILE' ? missingPath : undefined)),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle();
    expect(r.bundle.id).toBe('embedded-default');
    expect(r.selectionReason).toBe('embedded_default');
    expect(r.bundle.parameters.softStackCap).toBe(DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS.softStackCap);
  });

  it('selects first bundle when no POLICY_ACTIVE_* env', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
    });
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'POLICY_REGISTRY_FILE' ? registryPath : undefined)),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle();
    expect(r.bundle.id).toBe('first');
    expect(r.selectionReason).toBe('registry_fallback_first');
    expect(r.bundle.parameters.softStackCap).toBe(4);
  });

  it('selects bundle by POLICY_ACTIVE_BUNDLE_ID', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
    });
    const nestConfig = {
      get: jest.fn((key: string) => {
        if (key === 'POLICY_REGISTRY_FILE') return registryPath;
        if (key === 'POLICY_ACTIVE_BUNDLE_ID') return 'second';
        return undefined;
      }),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle();
    expect(r.bundle.id).toBe('second');
    expect(r.selectionReason).toBe('env_bundle_id');
    expect(r.bundle.parameters.softStackCap).toBe(9);
  });

  it('selects bundle by POLICY_ACTIVE_REVISION', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
    });
    const nestConfig = {
      get: jest.fn((key: string) => {
        if (key === 'POLICY_REGISTRY_FILE') return registryPath;
        if (key === 'POLICY_ACTIVE_REVISION') return 'rev-second';
        return undefined;
      }),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle();
    expect(r.bundle.id).toBe('second');
    expect(r.selectionReason).toBe('env_revision');
  });

  it('domain router selects bundle by tripIdPrefixes', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
      routing: {
        enabled: true,
        rules: [
          {
            id: 'trip-prefix-second',
            priority: 10,
            bundleId: 'second',
            when: { tripIdPrefixes: ['cohort-a-'] },
          },
        ],
      },
    });
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'POLICY_REGISTRY_FILE' ? registryPath : undefined)),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle(minimalCtx({ tripId: 'cohort-a-123' }));
    expect(r.bundle.id).toBe('second');
    expect(r.selectionReason).toBe('domain_rule');
    expect(r.routingRuleId).toBe('trip-prefix-second');
  });

  it('domain router selects bundle by countryCodes', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
      routing: {
        rules: [
          {
            id: 'country-second',
            priority: 5,
            bundleId: 'second',
            when: { countryCodes: ['JP'] },
          },
        ],
      },
    });
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'POLICY_REGISTRY_FILE' ? registryPath : undefined)),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle(minimalCtx({ countryCode: 'jp' }));
    expect(r.bundle.id).toBe('second');
    expect(r.routingRuleId).toBe('country-second');
  });

  it('POLICY_ACTIVE_BUNDLE_ID overrides domain routing', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
      routing: {
        rules: [
          {
            id: 'trip-prefix-second',
            priority: 10,
            bundleId: 'second',
            when: { tripIdPrefixes: ['ab-'] },
          },
        ],
      },
    });
    const nestConfig = {
      get: jest.fn((key: string) => {
        if (key === 'POLICY_REGISTRY_FILE') return registryPath;
        if (key === 'POLICY_ACTIVE_BUNDLE_ID') return 'first';
        return undefined;
      }),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle(minimalCtx({ tripId: 'ab-test' }));
    expect(r.bundle.id).toBe('first');
    expect(r.selectionReason).toBe('env_bundle_id');
    expect(r.routingRuleId).toBeUndefined();
  });

  it('POLICY_ROUTER_DISABLED skips domain routing', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
      routing: {
        rules: [
          {
            id: 'trip-prefix-second',
            priority: 10,
            bundleId: 'second',
            when: { tripIdPrefixes: ['x-'] },
          },
        ],
      },
    });
    const nestConfig = {
      get: jest.fn((key: string) => {
        if (key === 'POLICY_REGISTRY_FILE') return registryPath;
        if (key === 'POLICY_ROUTER_DISABLED') return 'true';
        return undefined;
      }),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle(minimalCtx({ tripId: 'x-1' }));
    expect(r.bundle.id).toBe('first');
    expect(r.selectionReason).toBe('routing_disabled');
  });

  it('without planning context skips domain routing (routing_skipped_no_context)', () => {
    const base = { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS };
    const registryPath = writeRegistry({
      bundles: [
        {
          id: 'first',
          revision: 'rev-first',
          parameters: { ...base, revision: 'rev-first', softStackCap: 4 },
        },
        {
          id: 'second',
          revision: 'rev-second',
          parameters: { ...base, revision: 'rev-second', softStackCap: 9 },
        },
      ],
      routing: {
        rules: [
          {
            id: 'always-second-on-trip',
            priority: 10,
            bundleId: 'second',
            when: { tripIdPrefixes: ['z-'] },
          },
        ],
      },
    });
    const nestConfig = {
      get: jest.fn((key: string) => (key === 'POLICY_REGISTRY_FILE' ? registryPath : undefined)),
    };
    const svc = new RoutePlanningPolicyRegistryService(nestConfig as any);
    const r = svc.resolveActiveBundle();
    expect(r.bundle.id).toBe('first');
    expect(r.selectionReason).toBe('routing_skipped_no_context');
  });
});
