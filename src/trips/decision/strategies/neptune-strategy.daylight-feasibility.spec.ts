import { NeptuneStrategy } from './neptune-strategy.service';
import type { WorldModelContext } from '../shared/world-model.types';
import type { RoutePlanDraft } from '../shared/world-model.types';
import type { SpatialReplacementService } from '../services/spatial-replacement.service';
import type { SpatialIssueDetectorService } from '../services/spatial-issue-detector.service';

describe('NeptuneStrategy daylight feasibility overlay', () => {
  it('detectAdditionalSpatialIssues adds SOFT skipSpatialRepair issue', async () => {
    const strategy = new NeptuneStrategy(
      {} as SpatialReplacementService,
      {} as SpatialIssueDetectorService,
    );

    const world = {
      physical: {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 6,
        daylightFeasibilitySignal: {
          latitudeDeg: 64.14,
          longitudeDeg: -21.94,
          slotsEndingAfterCivilDusk: ['slot_a'],
          slotsStartingBeforeCivilDawn: [],
          violationCount: 1,
        },
      },
      human: {} as WorldModelContext['human'],
      routeDirection: { uuid: 'rd' } as WorldModelContext['routeDirection'],
    } as WorldModelContext;

    const plan: RoutePlanDraft = {
      tripId: 't1',
      routeDirectionId: 'rd',
      segments: [
        {
          segmentId: 'seg1',
          dayIndex: 1,
          distanceKm: 40,
          ascentM: 100,
          slopePct: 2,
          metadata: {},
        },
      ],
    };

    const issues = await (
      strategy as unknown as {
        detectAdditionalSpatialIssues(
          w: WorldModelContext,
          p: RoutePlanDraft,
        ): Promise<import('../interfaces/spatial-issue.interface').SpatialIssue[]>;
      }
    ).detectAdditionalSpatialIssues(world, plan);

    const d = issues.find(
      i => i.metadata?.source === 'DAYLIGHT_FEASIBILITY',
    );
    expect(d).toBeDefined();
    expect(d!.severity).toBe('SOFT');
    expect(d!.metadata?.skipSpatialRepair).toBe(true);
    expect(d!.metadata?.slotsEndingAfterCivilDusk).toContain('slot_a');
  });
});
