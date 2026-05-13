import { WorldStateSummarizeSkill } from './world-state-summarize.skill';
import type { WorldModelContext } from '../../trips/decision/shared/world-model.types';
import { WorldOperationalArbitrator } from '../../world/operational/world-operational-arbitrator';
import { sliceFromSafetravelOutput } from '../../world/domains/iceland/iceland-slice-normalizer';

describe('WorldStateSummarizeSkill', () => {
  const skill = new WorldStateSummarizeSkill(undefined, undefined, undefined);

  function minimalWorld(over: Partial<WorldModelContext['physical']> = {}): WorldModelContext {
    return {
      physical: {
        demEvidence: [],
        roadStates: [],
        hazardZones: [],
        ferryStates: [],
        weatherEvidence: [],
        countryCode: 'IS',
        month: 2,
        ...over,
      } as WorldModelContext['physical'],
      human: { riskTolerance: 'MEDIUM' } as WorldModelContext['human'],
      routeDirection: { id: 'x', title: 't' } as WorldModelContext['routeDirection'],
    };
  }

  it('returns high operational risk when weather HARD', async () => {
    const world = minimalWorld({
      weatherEvidence: [
        {
          segmentId: 's1',
          windSpeedMs: 10,
          precipitationMm: 0,
          violation: 'HARD',
        },
      ],
    });
    const out = await skill.execute({ world });
    expect(out.operationalWorldState.operationalRisk).toBe('high');
    expect(out.operationalWorldState.blockingFactors.some((b) => b.includes('weather_hard'))).toBe(true);
  });

  it('summarizes from legacy raw slices when no world', async () => {
    const out = await skill.execute({
      slices: { road: 'F-road closed due to storm' },
    });
    expect(out.operationalWorldState.operationalRisk).toMatch(/high|medium/);
    expect(out.operationalWorldState.confidence).toBeLessThan(0.6);
    expect(out.operationalArbitration).toBeUndefined();
  });

  it('tripId + IS uses pipeline typed slices + arbitration', async () => {
    const worldBuild = {
      execute: jest.fn().mockResolvedValue({
        world: minimalWorld({
          hazardZones: [{ zoneId: 'F208_segment', type: 'OTHER' as const, level: 'LOW' as const }],
        }),
        missingPieces: {},
      }),
    };
    const stSlice = sliceFromSafetravelOutput({
      gate_recommendation: 'BLOCK',
      summary: 'critical',
      alerts: [],
      rss_refined: [],
      safetravel_alerts: [],
      lastUpdated: 't',
      source: 'safetravel.is/feed',
    });
    const pipeline = {
      run: jest.fn().mockResolvedValue({
        slices: [stSlice],
        gathered: true,
      }),
    };
    const arbitrator = new WorldOperationalArbitrator();

    const dagSkill = new WorldStateSummarizeSkill(
      worldBuild as any,
      pipeline as any,
      arbitrator,
    );

    const out = await dagSkill.execute({ tripId: 'trip-is-1' });
    expect(out.icelandSlicesGathered).toBe(true);
    expect(out.operationalArbitration?.executionStatus).toBe('blocked');
    expect(pipeline.run).toHaveBeenCalled();
  });

  it('skips pipeline when gatherIcelandDomainSlices is false', async () => {
    const worldBuild = {
      execute: jest.fn().mockResolvedValue({
        world: minimalWorld(),
        missingPieces: {},
      }),
    };
    const pipeline = { run: jest.fn() };
    const arbitrator = new WorldOperationalArbitrator();
    const dagSkill = new WorldStateSummarizeSkill(worldBuild as any, pipeline as any, arbitrator);
    await dagSkill.execute({ tripId: 't2', gatherIcelandDomainSlices: false });
    expect(pipeline.run).not.toHaveBeenCalled();
  });
});
