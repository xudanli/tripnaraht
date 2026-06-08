import type { CaptainPersonaSnapshot } from '../types/match-square.types';
import { buildCollaborativeTaskDispatchPlan } from './collaborative-task-dispatch.engine';

function snapshot(mbti: string, control = 1): CaptainPersonaSnapshot {
  return {
    mbtiType: mbti,
    cardTitle: mbti,
    interactionMode: 'member',
    interactionModeLabel: mbti,
    dimensionPercents: { E: 50, I: 50, N: 50, S: 50, T: 50, F: 50, J: 50, P: 50 },
    rawScores: {
      control_desire: control,
      ambiguity_tolerance: 0,
      stress_anxiety_index: 0,
      financial_flexibility: 2,
      energy_capacity: 2,
      aesthetic_preference: 2,
      quality_baseline: 1,
      safety_first: 0,
    },
  } as CaptainPersonaSnapshot;
}

describe('buildCollaborativeTaskDispatchPlan', () => {
  it('dispatches Iceland tasks to captain and ISTP member', () => {
    const plan = buildCollaborativeTaskDispatchPlan({
      recruitmentPostId: 'post-1',
      canDispatch: true,
      vibeChipIds: ['dem_blind_nav', 'glacier_river_ford'],
      milestoneIds: ['fjordungakvisl_ford_gear_check'],
      recruitmentScriptId: 'iceland_laugavegur_heavy_trek',
      crew: [
        {
          userId: 'captain-1',
          role: 'captain',
          displayLabel: 'Danny · 队长',
          snapshot: snapshot('INTJ', 3),
        },
        {
          userId: 'driver-1',
          role: 'member',
          displayLabel: '老司机',
          snapshot: snapshot('ISTP', 1),
          memberSlotIndex: 1,
        },
        {
          userId: 'member-2',
          role: 'member',
          displayLabel: '王小野',
          snapshot: snapshot('ENFP', 0),
          memberSlotIndex: 2,
          sceneRoleAnchor: 'blind_box_follower',
        },
      ],
      extraMitigatingTemplateIds: ['pre_trip_safety_blueprint'],
    });

    expect(plan.tasks.length).toBeGreaterThanOrEqual(2);
    const templateIds = plan.tasks.map((t) => t.templateId);
    expect(templateIds).toContain('satellite_dem_offline_verify');
    expect(templateIds).toContain('ford_gear_shared_checklist');

    const demTask = plan.tasks.find((t) => t.templateId === 'satellite_dem_offline_verify');
    expect(demTask?.assigneeUserId).toBe('captain-1');

    const fordTask = plan.tasks.find((t) => t.templateId === 'ford_gear_shared_checklist');
    expect(fordTask?.assigneeUserId).toBe('driver-1');

    const safetyTask = plan.tasks.find((t) => t.templateId === 'pre_trip_safety_blueprint');
    expect(safetyTask?.assigneeUserId).toBe('member-2');
  });
});
