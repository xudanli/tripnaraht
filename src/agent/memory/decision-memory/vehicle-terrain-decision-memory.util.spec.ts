// src/agent/memory/decision-memory/vehicle-terrain-decision-memory.util.spec.ts
import type { DecisionMemory } from './decision-memory.types';
import type { WorldDecisionMemoryService } from './world-decision-memory.service';
import {
  buildTerrainFroadUnfitAxiomDecisionMemory,
  appendVehicleTerrainArbitrationTrace,
  pickLastVehicleAcceptedCausalityFromList,
} from './vehicle-terrain-decision-memory.util';

describe('vehicle-terrain-decision-memory.util', () => {
  it('buildTerrainFroadUnfitAxiomDecisionMemory chains prior causality ids', () => {
    const dm = buildTerrainFroadUnfitAxiomDecisionMemory({
      axiomCid: 'TERRAIN_X',
      message: 'blocked',
      priorCausalityIds: ['abc-123'],
    });
    expect(dm.decisionType).toBe('risk_block');
    expect(dm.causedBy).toContain('decision:abc-123');
    expect(dm.causedBy).toContain('axiom:TERRAIN_X');
  });

  it('appendVehicleTerrainArbitrationTrace appends accepted when Iceland context and no terrain issues', () => {
    const appended: DecisionMemory[] = [];
    const mockSvc = { append: (d: DecisionMemory) => appended.push(d) } as unknown as WorldDecisionMemoryService;
    appendVehicleTerrainArbitrationTrace(mockSvc, {
      terrainIssues: [],
      itinerary: { days: [{ date: '2026-01-10', items: [] }] } as any,
      research_data: { country_code: 'IS' },
    });
    expect(appended).toHaveLength(1);
    expect(appended[0].outcome).toBe('accepted');
    expect(appended[0].decisionType).toBe('vehicle');
  });

  it('appendVehicleTerrainArbitrationTrace maps vehicle terrain issues to decision memory', () => {
    const appended: DecisionMemory[] = [];
    const mockSvc = { append: (d: DecisionMemory) => appended.push(d) } as unknown as WorldDecisionMemoryService;
    appendVehicleTerrainArbitrationTrace(mockSvc, {
      terrainIssues: [
        {
          severity: 'CRITICAL',
          message: 'F-road vs 2WD',
          violation: {
            anchor: {
              constraintId: 'TERRAIN',
              ruleId: 'itinerary.verify:iceland_vehicle_terrain_v2:froad_2wd',
            },
            entityRef: { id: 'vehicle_terrain_arbitrator', type: 'OTHER' },
            evidence: { source: 'MODEL', refIds: ['car_rentals'] },
          },
        },
      ],
      itinerary: { days: [] } as any,
    });
    expect(appended).toHaveLength(1);
    expect(appended[0].outcome).toBe('rejected');
    expect(appended[0].causedBy.some((c) => c.includes('froad'))).toBe(true);
  });

  it('pickLastVehicleAcceptedCausalityFromList returns most recent accepted scanning from tail', () => {
    const a: DecisionMemory = {
      causalityId: 'a1',
      decisionType: 'vehicle',
      inputs: {},
      outputs: {},
      outcome: 'accepted',
      rationale: [],
      causedBy: [],
      timestamp: 1,
    };
    const b: DecisionMemory = {
      causalityId: 'b1',
      decisionType: 'vehicle',
      inputs: {},
      outputs: {},
      outcome: 'rejected',
      rationale: [],
      causedBy: [],
      timestamp: 2,
    };
    const c: DecisionMemory = {
      causalityId: 'c1',
      decisionType: 'vehicle',
      inputs: {},
      outputs: {},
      outcome: 'accepted',
      rationale: [],
      causedBy: [],
      timestamp: 3,
    };
    expect(pickLastVehicleAcceptedCausalityFromList([a, b, c])).toEqual(['c1']);
    expect(pickLastVehicleAcceptedCausalityFromList([b, a])).toEqual(['a1']);
    expect(pickLastVehicleAcceptedCausalityFromList([b])).toBeUndefined();
  });
});
