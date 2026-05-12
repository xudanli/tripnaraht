import type { ResolvedRoutePlanningPolicyBundle } from './policy-registry.types';
import { DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS } from './route-planning-policy.defaults';
import { PolicySelectionLogService } from './policy-selection-log.service';

describe('PolicySelectionLogService', () => {
  const resolvedBase: ResolvedRoutePlanningPolicyBundle = {
    bundle: {
      id: 'b1',
      revision: 'rev-1',
      parameters: { ...DEFAULT_ROUTE_PLANNING_POLICY_PARAMETERS },
      policyDeclarations: [],
    },
    selectionReason: 'registry_fallback_first',
  };

  it('scheduleRecord no-ops when disabled', () => {
    process.env.POLICY_SELECTION_LOG_ENABLED = 'false';
    const prisma = {
      routePlanningPolicyBundleVersion: { findUnique: jest.fn(), create: jest.fn() },
      policySelectionLog: { create: jest.fn() },
    };
    const nestConfig = {
      get: jest.fn((key: string) =>
        key === 'POLICY_SELECTION_LOG_ENABLED' ? process.env.POLICY_SELECTION_LOG_ENABLED : undefined,
      ),
    };
    const svc = new PolicySelectionLogService(prisma as any, nestConfig as any);
    svc.scheduleRecord({
      planningContext: null,
      resolved: resolvedBase,
      effectiveRevision: 'eff',
    });
    expect(prisma.policySelectionLog.create).not.toHaveBeenCalled();
  });

  it('scheduleRecord persists when enabled', async () => {
    process.env.POLICY_SELECTION_LOG_ENABLED = 'true';
    const bvId = '00000000-0000-0000-0000-000000000001';
    const prisma = {
      routePlanningPolicyBundleVersion: {
        findUnique: jest.fn().mockResolvedValue({
          id: bvId,
          bundleKey: 'b1',
          revision: 'rev-1',
        }),
      },
      policySelectionLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
    };
    const nestConfig = {
      get: jest.fn((key: string) =>
        key === 'POLICY_SELECTION_LOG_ENABLED' ? process.env.POLICY_SELECTION_LOG_ENABLED : undefined,
      ),
    };
    const svc = new PolicySelectionLogService(prisma as any, nestConfig as any);
    svc.scheduleRecord({
      planningContext: {
        countryCode: 'IS',
        tripId: 't1',
        tripExecutionHistory: [],
        hints: {
          routeDegradeCountByRouteDirectionId: {},
          ambientDegradeEvents: 0,
        },
      },
      resolved: {
        ...resolvedBase,
        routingRuleId: 'rule-a',
      },
      effectiveRevision: 'eff-rev',
    });
    await new Promise((r) => setImmediate(r));
    expect(prisma.policySelectionLog.create).toHaveBeenCalled();
  });
});
