import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import { hydrateRelaxationConstraintsFromTripRecord } from './trip-relaxation-hydrate.util';

describe('hydrateRelaxationConstraintsFromTripRecord', () => {
  it('hydrates vehicle_type and budget from trip record', () => {
    const plan: TripPlanRequest = {
      request_id: 'r1',
      origin: 'Reykjavik',
      destination: 'IS',
      constraints: {},
    };
    const filled = hydrateRelaxationConstraintsFromTripRecord(plan, {
      metadata: {
        constraintsVersion: 2,
        agent_plan_constraints: { vehicle_type: '4WD', pacing_mode: 'conservative' },
      },
      pacingConfig: { vehicleType: '4WD', pacingMode: 'conservative' },
      budgetConfig: { total: 55000, currency: 'CNY' },
    });
    expect(plan.constraints?.vehicle_type).toBe('4WD');
    expect((plan.constraints as Record<string, unknown>).pacing_mode).toBe('conservative');
    expect(plan.constraints?.budget?.total).toBe(55000);
    expect(filled).toContain('constraints.vehicle_type');
    expect(filled).toContain('constraints_version');
  });

  it('does not overwrite explicit vehicle_type on plan', () => {
    const plan: TripPlanRequest = {
      request_id: 'r1',
      origin: 'x',
      destination: 'y',
      constraints: { vehicle_type: '2WD' },
    };
    hydrateRelaxationConstraintsFromTripRecord(plan, {
      metadata: { agent_plan_constraints: { vehicle_type: '4WD' } },
    });
    expect(plan.constraints?.vehicle_type).toBe('2WD');
  });

  it('hydrates vehicle_type from metadata.constraints when agent_plan/pacing absent', () => {
    const plan: TripPlanRequest = {
      request_id: 'r1',
      origin: 'Reykjavik',
      destination: 'IS',
      constraints: {},
    };
    const filled = hydrateRelaxationConstraintsFromTripRecord(plan, {
      metadata: {
        constraints: { vehicleType: '4WD', vehicle_type: '4WD', excludeFRoad: true },
      },
      pacingConfig: { travelMode: 'DRIVING' },
    });
    expect(plan.constraints?.vehicle_type).toBe('4WD');
    expect(filled).toContain('constraints.vehicle_type');
  });
});
