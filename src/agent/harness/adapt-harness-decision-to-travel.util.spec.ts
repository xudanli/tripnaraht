import { buildTravelDecisionProblem } from '../decision-support/build-travel-decision-problem.util';
import { compileAgentTaskContract } from './compile-agent-task-contract.util';
import { runVehicleRoadFitDecision } from './decision-runtime.util';
import {
  applyHarnessPipelineToTravelProblem,
  mapHarnessDecisionKeyToRegistry,
  mapHarnessOptionIdToTravel,
  projectHarnessDecisionPipelineForTrace,
} from './adapt-harness-decision-to-travel.util';

describe('adapt-harness-decision-to-travel (D3)', () => {
  it('maps harness option ids to TravelDecision ids', () => {
    expect(mapHarnessOptionIdToTravel('2wd')).toBe('2WD');
    expect(mapHarnessOptionIdToTravel('4wd')).toBe('4WD');
    expect(mapHarnessOptionIdToTravel('south_coast')).toBe('SOUTH_COAST');
    expect(mapHarnessDecisionKeyToRegistry('ROUTE_SCOPE_RING_VS_SOUTH', 'ROUTE_SEGMENT')).toBe(
      'TRIP_SCOPE',
    );
  });

  it('applies Gate BLOCKED + recommend onto TravelDecisionProblem for UI card', () => {
    const contract = compileAgentTaskContract({
      message: '两驱还是四驱？要走 F-road 高地',
      turnId: 'd3',
      tripId: 'trip-d3',
    });
    const pipe = runVehicleRoadFitDecision({
      contract,
      message: '两驱还是四驱？要走 F-road 高地',
    });
    const base = buildTravelDecisionProblem('VEHICLE_ROAD_FIT', {
      tripId: 'trip-d3',
      message: '两驱还是四驱？要走 F-road 高地',
    })!;
    const merged = applyHarnessPipelineToTravelProblem(base, pipe);
    expect(merged.options.find((o) => o.optionId === '2WD')?.feasibility).toBe('BLOCKED');
    expect(merged.recommendation?.optionId).toBe('4WD');
    expect(merged.options.find((o) => o.optionId === '4WD')?.recommended).toBe(true);
    const trace = projectHarnessDecisionPipelineForTrace(pipe);
    expect(trace.applied_to_itinerary).toBe(false);
    expect(trace.commit_authority).toBe('DECISION_ONLY');
    expect(trace.phases_completed).toEqual(
      expect.arrayContaining(['GATE', 'COMPARE', 'RECOMMEND']),
    );
  });
});
