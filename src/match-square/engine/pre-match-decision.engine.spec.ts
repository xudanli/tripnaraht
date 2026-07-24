import type { CaptainPersonaSnapshot } from '../types/match-square.types';
import { buildPreMatchDecisionBrief } from './pre-match-decision.engine';

function captainSnapshot(overrides?: Partial<CaptainPersonaSnapshot['rawScores']>): CaptainPersonaSnapshot {
  return {
    mbtiType: 'INTJ',
    cardTitle: '指挥官',
    interactionMode: 'commander',
    interactionModeLabel: '指挥官',
    dimensionPercents: { E: 20, I: 80, N: 70, S: 30, T: 75, F: 25, J: 80, P: 20 },
    rawScores: {
      control_desire: 3,
      ambiguity_tolerance: -1,
      stress_anxiety_index: 0,
      financial_flexibility: 2,
      energy_capacity: 3,
      aesthetic_preference: 2,
      quality_baseline: 2,
      safety_first: 1,
      ...overrides,
    },
  } as CaptainPersonaSnapshot;
}

function anxiousApplicant(): CaptainPersonaSnapshot {
  return {
    mbtiType: 'ENFP',
    cardTitle: '探索者',
    interactionMode: 'explorer',
    interactionModeLabel: '探索者',
    dimensionPercents: { E: 70, I: 30, N: 65, S: 35, T: 40, F: 60, J: 35, P: 65 },
    rawScores: {
      control_desire: 0,
      ambiguity_tolerance: -1,
      stress_anxiety_index: 2,
      financial_flexibility: 2,
      energy_capacity: 3,
      aesthetic_preference: 2,
      quality_baseline: 1,
      safety_first: 0,
    },
  } as CaptainPersonaSnapshot;
}

describe('buildPreMatchDecisionBrief', () => {
  it('predicts ~18% noise for Iceland blind nav + commander + anxious applicant', () => {
    const brief = buildPreMatchDecisionBrief({
      captain: captainSnapshot(),
      applicant: anxiousApplicant(),
      teamworkStyle: 'full_managed',
      hardMetricsPass: true,
      vibeChipIds: ['dem_blind_nav', 'glacier_river_ford', 'laugavegur_55km'],
      recruitmentScriptId: 'iceland_laugavegur_heavy_trek',
      trekkingOrchestration: {
        version: 'trekking_orchestration_v1',
        scriptId: 'iceland_laugavegur_heavy_trek',
        sceneCategory: 'premium_trekking',
        worldModel: {
          profile: 'heavy_offline_dem',
          routeDirectionCandidates: [],
          offlineDataPreloadRequired: true,
          demGridMetres: 12.5,
          physicalConstraints: ['dem_digital_elevation'],
        },
        sharedGearDeficits: [],
        eventStreamMilestones: [
          {
            slot: 'pre_dawn',
            eventId: 'fjordungakvisl_ford_gear_check',
            label: '涉水检查',
            condition: 'milestone:fjordungakvisl_river',
          },
        ],
        toolchain: [],
        dnaEvolution: { teamworkModel: 'Co-Creation' },
        structuralMatch: { filterNegativeTags: [], preferSlotMbtiTypes: true, requireHighSecurity: false },
      },
    });

    expect(brief.hardMetricsPass).toBe(true);
    expect(brief.inTripCollaborationNoisePercent).toBeGreaterThanOrEqual(18);
    expect(brief.suggestedSceneRoleAnchor).toBe('blind_box_follower');
    expect(brief.suggestedSceneRoleLabel).toContain('盲盒跟从者');
    expect(brief.mitigatingTaskTemplateIds).toContain('pre_trip_safety_blueprint');
    expect(brief.narrativeLine).toMatch(/决策引擎提示/);
    expect(brief.narrativeLine).toMatch(new RegExp(`${brief.inTripCollaborationNoisePercent}%`));
  });

  it('returns low noise when no blind nav exposure', () => {
    const brief = buildPreMatchDecisionBrief({
      captain: captainSnapshot(),
      applicant: anxiousApplicant(),
      hardMetricsPass: true,
      vibeChipIds: ['cooking_partner'],
    });

    expect(brief.inTripCollaborationNoisePercent).toBeLessThan(12);
    expect(brief.suggestedSceneRoleAnchor).toBeNull();
  });
});
