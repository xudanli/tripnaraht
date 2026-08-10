import { getOpsSystemPrinciples } from './ops-system-principles.util';
import { buildNaraTrustMap } from './nara-trust-map.util';
import { diagnoseNonUse } from './non-use-diagnosis.util';
import { concludeWeeklyTripInsight } from './weekly-trip-insight.util';

describe('Operations System (not roadmap)', () => {
  it('principles: New Capability=NO healthy; weekly asks what trips told us', () => {
    const p = getOpsSystemPrinciples();
    expect(p.phase).toBe('OPERATIONS_SYSTEM');
    expect(p.notRoadmapState).toBe(true);
    expect(p.newCapabilityNoIsHealthy).toBe(true);
    expect(p.weeklyPrimaryQuestionZh).toMatch(/真实 Trip 告诉了我们什么/);
    expect(p.wallSlogans[0]).toBe('No evidence, no feature.');
  });

  it('Trust Map flags high-value low-trust bands for V1.1 priority', () => {
    const map = buildNaraTrustMap();
    expect(map.optimizeTrustGapNotMaxCapabilityGap).toBe(true);
    expect(map.highValueLowTrustBands.length).toBeGreaterThan(0);
    expect(map.highValueLowTrustBands).toEqual(
      expect.arrayContaining([
        'HIGH_COST_DECISION',
        'LODGING_ROUTE_TRADEOFF',
        'LIVE_EXECUTION_JUDGMENT',
        'SAFETY_RELATED',
      ]),
    );
  });

  it('non-use diagnosis order; only last stage discusses new capability', () => {
    expect(
      diagnoseNonUse({
        tripId: 't1',
        hints: { didNotKnowCouldAsk: true, wantedButSystemCannot: true },
      }).stage,
    ).toBe('DISCOVERABILITY');

    expect(
      diagnoseNonUse({
        tripId: 't1',
        hints: { answerGoodButUntrusted: true },
      }).mayDiscussNewCapability,
    ).toBe(false);

    const v11 = diagnoseNonUse({
      tripId: 't1',
      hints: {
        wantedButSystemCannot: true,
        repeated: true,
        highVolume: true,
        highValue: true,
      },
    });
    expect(v11.stage).toBe('V11_CANDIDATE');
    expect(v11.mayDiscussNewCapability).toBe(true);
  });

  it('no systemic issue → continue trips', () => {
    const quiet = concludeWeeklyTripInsight({
      weekId: '2026-W34',
      whatTripsToldUsZh: '没有新的系统性问题',
    });
    expect(quiet.correctAction).toBe('CONTINUE_TRIPS');
    expect(quiet.hasNewSystemicIssue).toBe(false);

    const fix = concludeWeeklyTripInsight({
      weekId: '2026-W32',
      whatTripsToldUsZh: 'Adjust Confirm 文案导致放弃',
      hasP0OrP1OrFrictionOrDataGap: true,
    });
    expect(fix.correctAction).toBe('MINIMAL_FIX_LOOP');
  });
});
