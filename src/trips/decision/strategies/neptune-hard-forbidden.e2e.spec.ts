import { NeptuneStrategy } from './neptune-strategy.service';
import { deriveFactsFromMetadata } from '../shared/fact-derivation.util';

describe('NeptuneStrategy — hard forbidden injector (E2E regression)', () => {
  it('wall-in-the-middle: CLOSED segment is treated as HARD blocked and removed from updatedPlan', async () => {
    const spatialReplacement = {
      replaceSegmentCorridor: jest.fn().mockResolvedValue({
        type: 'SEGMENT_REPLACEMENT',
        originalSegmentId: 'B',
        newSegmentIds: ['X'],
        score: 1,
        explanation: 'reroute around closed segment',
      }),
      replaceEntry: jest.fn(),
      replacePoi: jest.fn(),
    } as any;

    const spatialIssueDetector = {
      detect: jest.fn().mockResolvedValue([]),
    } as any;

    const s = new NeptuneStrategy(spatialReplacement, spatialIssueDetector);

    const world: any = {
      physical: {
        demEvidence: [
          {
            segmentId: 'B',
            elevationProfile: [],
            cumulativeAscent: 0,
            maxSlopePct: 0,
            rollingAscent3Days: 0,
            fatigueIndex: 0,
            violation: 'NONE',
            explanation: 'stub',
          },
        ],
        roadStates: [
          {
            roadId: 'emergency_B',
            status: 'CLOSED',
            segmentId: 'B',
            metadata: { source: 'EMERGENCY_CONSTRAINT', reason_code: 'HEALING_PHYSICAL_DRIFT' },
          },
        ],
        hazardZones: [],
        ferryStates: [],
        countryCode: 'IS',
        month: 6,
      },
      human: {
        profileId: 'u1',
        maxDailyAscentM: 800,
        rollingAscent3DaysM: 2000,
        maxSlopePct: 15,
        preferredPace: 'MEDIUM',
        riskTolerance: 'MEDIUM',
        highAltitudeExperience: 'BASIC',
      },
      routeDirection: { id: 'rd1', name: 'rd1', nameCN: 'rd1', tags: [], philosophy: '' },
    };

    const plan: any = {
      tripId: 'trip-1',
      routeDirectionId: 'rd1',
      segments: [
        { segmentId: 'A', dayIndex: 1, distanceKm: 1, ascentM: 0, slopePct: 0 },
        { segmentId: 'B', dayIndex: 1, distanceKm: 1, ascentM: 0, slopePct: 0 },
        { segmentId: 'C', dayIndex: 1, distanceKm: 1, ascentM: 0, slopePct: 0 },
      ],
    };

    const res = await s.evaluate(world, plan);

    // Assert Neptune attempted corridor replacement for the blocked segment.
    expect(spatialReplacement.replaceSegmentCorridor).toHaveBeenCalledTimes(1);
    expect(res.action).toBe('REPLACE');
    expect(res.updatedPlan).toBeTruthy();
    expect((res.updatedPlan as any).segments.map((x: any) => x.segmentId)).toEqual(['A', 'C']);

    // Assert decision log carries road_closed evidence for QA/Contract/Healing.
    const replaceLog = (res.logs || []).find((l: any) => l.action === 'REPLACE');
    expect(replaceLog).toBeTruthy();
    expect(replaceLog?.metadata?.rule_id).toBe('road_closed_v1');
    expect(replaceLog?.metadata?.details?.evidence?.type).toBe('road_state');
    expect(replaceLog?.metadata?.details?.evidence?.status).toBe('CLOSED');
    expect(replaceLog?.metadata?.details?.evidence?.source).toBe('EMERGENCY_CONSTRAINT');

    // Assert facts derivation marks it as HARD violated (truth snapshot).
    const facts = deriveFactsFromMetadata({
      metadata: replaceLog?.metadata ?? {},
      reasonCodes: ['road_closed_v1'],
      timestampIso: replaceLog?.timestamp,
    });
    expect(facts.some((f) => f.rule_id === 'road_closed_v1' && f.severity === 'HARD' && f.is_violated === true)).toBe(
      true,
    );
  });
});

