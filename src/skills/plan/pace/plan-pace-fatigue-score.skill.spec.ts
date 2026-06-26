import { PlanPaceFatigueScoreSkill } from './plan-pace-fatigue-score.skill';

describe('PlanPaceFatigueScoreSkill', () => {
  it('counts hiking and volcano days as fatigue drivers even without DEM data', async () => {
    const skill = new PlanPaceFatigueScoreSkill();

    const result = await skill.execute({
      planState: {
        plan_id: 'plan_test',
        plan_version: 1,
        constraints: {
          time: { days: 5 },
          budget: {},
          fitness: { level: 'medium' },
        },
        itinerary: {
          anchors: [
            { day: 1, location: 'Laugavegur', activity: '徒步', priority: 'anchor' },
            { day: 2, location: 'Fagradalsfjall', activity: '火山徒步', priority: 'core' },
          ],
        },
        mobility: { transferSegments: [] },
        budget: {},
        pace: { timeWindows: [] },
        gate: { status: 'ALLOW', reasons: [], missingEvidence: [] },
        evidence_refs: [],
        decision_log_refs: [],
        status: 'DRAFT',
      } as any,
    });

    expect(result.fatigueScore.paceScore).toBeGreaterThan(0);
    expect(result.fatigueScore.fatigueDrivers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'long_walk',
        }),
      ]),
    );
  });
});
