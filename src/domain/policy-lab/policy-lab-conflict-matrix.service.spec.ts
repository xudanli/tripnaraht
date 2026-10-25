import {
  mapPolicyLabHitToRegistry,
  policyLabHitToAssertion,
} from './policy-lab-effect-to-registry.util';
import type { ConflictMatrixHit } from '../../trips/decision/shared/conflict-matrix.util';
import { PolicyLabConflictMatrixService } from './policy-lab-conflict-matrix.service';
import { buildFactsFromPhysicalWorld } from './policy-lab-conflict-matrix.facts.util';

describe('policy-lab-effect-to-registry.util', () => {
  it('maps HARD_BLOCK froad rule to ROAD_CLOSED BLOCK', () => {
    const hit: ConflictMatrixHit = {
      ruleId: 'iceland_froad_vehicle_block',
      effect: 'HARD_BLOCK',
      priority: 110,
      matchedConditions: ['segment.type = F_ROAD', 'vehicle.type = SMALL_CAR'],
    };
    const mapped = mapPolicyLabHitToRegistry(hit);
    expect(mapped.reasonCode).toBe('ROAD_CLOSED');
    expect(mapped.status).toBe('BLOCK');
    expect(mapped.severity).toBe('CRITICAL');
  });

  it('maps wind HARD_BLOCK to ACTIVITY_PROHIBITED', () => {
    const hit: ConflictMatrixHit = {
      ruleId: 'iceland_wind_small_car_block',
      effect: 'HARD_BLOCK',
      priority: 100,
      matchedConditions: ['weather.windSpeedKph > 50', 'vehicle.type = SMALL_CAR'],
    };
    expect(mapPolicyLabHitToRegistry(hit).reasonCode).toBe('ACTIVITY_PROHIBITED');
  });

  it('maps RE_ROUTE to WEATHER_STORM WARNING', () => {
    const hit: ConflictMatrixHit = {
      ruleId: 'iceland_heavy_rain_reroute',
      effect: 'RE_ROUTE',
      priority: 80,
      matchedConditions: [],
    };
    const mapped = mapPolicyLabHitToRegistry(hit);
    expect(mapped.reasonCode).toBe('WEATHER_STORM');
    expect(mapped.status).toBe('WARNING');
    expect(mapped.remediationHints?.length).toBeGreaterThan(0);
  });

  it('builds assertion with policy-lab evaluator', () => {
    const hit: ConflictMatrixHit = {
      ruleId: 'db_froad_visibility_block_v1',
      effect: 'HARD_BLOCK',
      priority: 120,
      matchedConditions: ['segment.type = F_ROAD'],
    };
    const a = policyLabHitToAssertion(hit, 'trip_1');
    expect(a.evaluator.engine).toBe('policy-lab');
    expect(a.evaluator.ruleId).toBe('db_froad_visibility_block_v1');
    expect(a.status).toBe('BLOCK');
  });
});

describe('PolicyLabConflictMatrixService', () => {
  it('loads CONFLICT_MATRIX rules from DB', async () => {
    const prismaMock = {
      physicalDomainConstraintConfig: {
        findMany: jest.fn().mockResolvedValue([
          {
            ruleId: 'db_rule_1',
            enabled: true,
            params: {
              kind: 'CONFLICT_MATRIX',
              conditions: ['segment.type = F_ROAD', 'weather.visibilityMeters < 100'],
              effect: 'HARD_BLOCK',
              priority: 120,
            },
          },
        ]),
      },
    };
    const svc = new PolicyLabConflictMatrixService(prismaMock as any);
    const rules = await svc.loadEnabledConflictMatrixRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('db_rule_1');
  });

  it('falls back when DB has no CONFLICT_MATRIX rows', async () => {
    const prismaMock = {
      physicalDomainConstraintConfig: {
        findMany: jest.fn().mockResolvedValue([
          { ruleId: 'wind_speed_drive_limit_v1', enabled: true, params: { unit: 'kph' } },
        ]),
      },
    };
    const svc = new PolicyLabConflictMatrixService(prismaMock as any);
    const rules = await svc.loadEnabledConflictMatrixRules();
    expect(rules.some((r) => r.id === 'froad_low_visibility_hard_block_v1')).toBe(true);
  });

  it('evaluates F_ROAD + low visibility as HARD_BLOCK', async () => {
    const svc = new PolicyLabConflictMatrixService();
    const facts = buildFactsFromPhysicalWorld({
      roadStates: [{ metadata: { segmentType: 'F_ROAD' } }],
      prefetchedEvidence: [
        {
          kind: 'environment_overrides_v1',
          overrides: {
            weather: {
              forecastSeries: [
                {
                  start: '2026-06-01T00:00:00.000Z',
                  end: '2026-06-01T06:00:00.000Z',
                  visibility_m: 80,
                  confidenceScore: 0.9,
                },
              ],
            },
          },
        },
      ],
      vehicleType: '2WD',
      timeISO: '2026-06-01',
    });
    const hits = await svc.evaluate(facts);
    expect(hits.some((h) => h.effect === 'HARD_BLOCK')).toBe(true);
  });
});
