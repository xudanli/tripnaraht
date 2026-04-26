import { NeptuneStrategy } from './neptune-strategy.service';
import { deriveFactsFromMetadata } from '../shared/fact-derivation.util';

describe('NeptuneStrategy — solar safety (E2E regression)', () => {
  it('activity ends after sunset safety threshold: emits HARD solar_safety_v1 evidence and derives HARD fact', async () => {
    const spatialReplacement = {
      replaceSegmentCorridor: jest.fn().mockResolvedValue({
        type: 'SEGMENT_REPLACEMENT',
        originalSegmentId: 'B',
        newSegmentIds: ['X'],
        score: 1,
        explanation: 'reorder around unsafe late activity',
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
        demEvidence: [],
        roadStates: [],
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
      tripId: 'trip-solar-1',
      routeDirectionId: 'rd1',
      segments: [
        { segmentId: 'A', dayIndex: 1, distanceKm: 1, ascentM: 0, slopePct: 0 },
        {
          segmentId: 'B',
          dayIndex: 1,
          distanceKm: 1,
          ascentM: 0,
          slopePct: 0,
          metadata: {
            is_high_risk: true, // buffer=60
            activity: { end_time_iso: '2026-06-01T19:30:00Z' },
          },
        },
        { segmentId: 'C', dayIndex: 1, distanceKm: 1, ascentM: 0, slopePct: 0 },
      ],
    };

    const res = await s.evaluate(world, plan);

    expect(spatialReplacement.replaceSegmentCorridor).toHaveBeenCalledTimes(1);

    const replaceLog = (res.logs || []).find((l: any) => l.action === 'REPLACE');
    expect(replaceLog).toBeTruthy();

    // Neptune emits machine evidence into metadata.details.evidence
    expect(replaceLog?.metadata?.rule_id).toBe('solar_safety_v1');
    expect(replaceLog?.metadata?.details?.evidence?.type).toBe('solar_safety');
    expect(replaceLog?.metadata?.details?.evidence?.actual_end_time_iso).toBe('2026-06-01T19:30:00.000Z');
    expect(replaceLog?.metadata?.details?.evidence?.buffer_min).toBe(60);
    expect(replaceLog?.metadata?.details?.evidence?.is_violated).toBe(true);

    // Fact derivation turns it into a HARD violated fact for Contract/QA
    const facts = deriveFactsFromMetadata({
      metadata: replaceLog?.metadata ?? {},
      reasonCodes: ['solar_safety_v1'],
      timestampIso: replaceLog?.timestamp,
    });
    expect(
      facts.some((f) => f.rule_id === 'solar_safety_v1' && f.severity === 'HARD' && f.is_violated === true),
    ).toBe(true);
  });
});

