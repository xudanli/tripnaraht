import type { FeasibilityIssueDto } from '../types/trip-constraint-solver.types';
import { filterAssemblerLegacyIssuesWhenProjected } from './assembler-legacy-domain-filter.util';

describe('assembler-legacy-domain-filter (Phase 6)', () => {
  const original = process.env.PHASE6_LEGACY_DEPRECATION;
  const originalProjection = process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;

  afterEach(() => {
    if (original === undefined) delete process.env.PHASE6_LEGACY_DEPRECATION;
    else process.env.PHASE6_LEGACY_DEPRECATION = original;
    if (originalProjection === undefined) delete process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION;
    else process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = originalProjection;
  });

  it('CAS-092: drops legacy poi_access when projected bundle has poi_access', () => {
    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    const legacy: FeasibilityIssueDto[] = [
      {
        id: 'legacy_poi',
        issueKind: 'poi_access_blocked',
        priority: 'must_handle',
        title: 'legacy',
        message: 'legacy',
        category: 'poi_access',
        affectedDays: [1],
        severity: 'high',
      },
      {
        id: 'experience',
        issueKind: 'experience_regret_unconfirmed',
        priority: 'pending_confirm',
        title: 'keep',
        message: 'keep',
        category: 'experience',
        affectedDays: [1],
        severity: 'low',
      },
    ];
    const projected: FeasibilityIssueDto[] = [
      {
        id: 'gw_poi',
        issueKind: 'poi_access_reservation_required',
        priority: 'must_handle',
        title: 'gateway',
        message: 'gw',
        category: 'poi_access',
        affectedDays: [1],
        severity: 'high',
      },
    ];

    const filtered = filterAssemblerLegacyIssuesWhenProjected(legacy, projected);
    expect(filtered.some((i) => String(i.issueKind).startsWith('poi_access'))).toBe(false);
    expect(filtered.some((i) => i.issueKind === 'experience_regret_unconfirmed')).toBe(true);
  });

  it('CAS-093: no-op when Phase 6 off', () => {
    delete process.env.PHASE6_LEGACY_DEPRECATION;
    const legacy = [
      {
        id: 'a',
        issueKind: 'poi_access_blocked',
        priority: 'must_handle',
        title: 'a',
        message: 'a',
        category: 'poi_access',
        affectedDays: [1],
        severity: 'high',
      } as FeasibilityIssueDto,
    ];
    const projected = [
      {
        id: 'b',
        issueKind: 'poi_access_blocked',
        priority: 'must_handle',
        title: 'b',
        message: 'b',
        category: 'poi_access',
        affectedDays: [1],
        severity: 'high',
      } as FeasibilityIssueDto,
    ];
    expect(filterAssemblerLegacyIssuesWhenProjected(legacy, projected)).toHaveLength(1);
  });

  it('CAS-114: exclusive mode drops legacy poi_access when gateway covered domain even with empty projected bundle', () => {
    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
    const legacy: FeasibilityIssueDto[] = [
      {
        id: 'legacy_finding_poi',
        issueKind: 'poi_access_blocked',
        priority: 'must_handle',
        title: 'legacy finding',
        message: 'legacy',
        category: 'access_capacity',
        affectedDays: [1],
        severity: 'high',
      },
      {
        id: 'experience',
        issueKind: 'experience_regret_unconfirmed',
        priority: 'pending_confirm',
        title: 'keep',
        message: 'keep',
        category: 'experience',
        affectedDays: [1],
        severity: 'low',
      },
    ];

    const filtered = filterAssemblerLegacyIssuesWhenProjected(legacy, [], {
      poiAccess: true,
      schedule: false,
      guardian: false,
    });
    expect(filtered.some((i) => i.category === 'access_capacity')).toBe(false);
    expect(filtered.some((i) => i.issueKind === 'experience_regret_unconfirmed')).toBe(true);
  });

  it('CAS-115: exclusive mode drops legacy schedule conflicts when schedule domain covered', () => {
    process.env.PHASE6_LEGACY_DEPRECATION = '1';
    process.env.CONSTRAINT_GATEWAY_PLAN_VERIFY_PROJECTION = '1';
    const legacy: FeasibilityIssueDto[] = [
      {
        id: 'legacy_schedule',
        issueKind: 'daily_drive',
        priority: 'must_handle',
        title: 'drive',
        message: 'drive',
        category: 'schedule',
        affectedDays: [1],
        severity: 'high',
      },
      {
        id: 'other',
        issueKind: 'road_class',
        priority: 'must_handle',
        title: 'road',
        message: 'road',
        category: 'road',
        affectedDays: [1],
        severity: 'high',
      },
    ];

    const filtered = filterAssemblerLegacyIssuesWhenProjected(legacy, [], {
      poiAccess: false,
      schedule: true,
      guardian: false,
    });
    expect(filtered.some((i) => i.issueKind === 'daily_drive')).toBe(false);
    expect(filtered.some((i) => i.issueKind === 'road_class')).toBe(true);
  });
});
