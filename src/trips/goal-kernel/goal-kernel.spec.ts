import { buildExecutionOverlay } from '../execution-overlay/build-execution-overlay';
import type { TripPlan } from '../decision/plan-model';
import { compileGoalToDAG, generateExecutionGoals, type ExecutionGoal } from './index';

describe('goal-kernel (P16-A)', () => {
  it('generateExecutionGoals combines memory, constraints, and signals', () => {
    const goals = generateExecutionGoals({
      memory: {
        events: [
          {
            id: 'a',
            dagId: 'd',
            irId: 'i',
            timestamp: 1,
            type: 'NEPTUNE_DECISION',
            payload: { triggerCount: 5 },
          },
        ],
        snapshots: [],
      },
      constraints: { roadFailureRate: 0.4, auroraOpportunityScore: 0.85 },
      signals: { auroraOpportunityScore: 0.9, weatherStress: 0.2 },
    });
    const types = new Set(goals.map(g => g.type));
    expect(types.has('REDUCE_RISK')).toBe(true);
    expect(types.has('EXPLORE_AURORA')).toBe(true);
    expect(goals[0]!.priority).toBeGreaterThanOrEqual(goals[goals.length - 1]!.priority);
  });

  it('compileGoalToDAG produces a witness DAG from plan + overlay', () => {
    const plan: TripPlan = {
      version: '1',
      createdAt: new Date().toISOString(),
      days: [
        {
          day: 1,
          date: '2026-06-01',
          timeSlots: [
            {
              id: 'leg-1',
              time: '10:00',
              title: 'Leg',
              type: 'transport',
              travelLegFromPrev: {
                mode: 'drive',
                from: { lat: 64, lng: -22 },
                to: { lat: 64.1, lng: -21.9 },
                durationMin: 30,
              },
            },
          ],
        },
      ],
    };
    const frames = buildExecutionOverlay({ plan, weatherByDate: {} });
    const goal: ExecutionGoal = {
      id: 'g1',
      type: 'MINIMIZE_COST',
      priority: 0.5,
      source: 'MEMORY',
      triggerContext: null,
    };
    const dag = compileGoalToDAG(goal, { plan, overlayFrames: frames });
    expect(dag.nodes.length).toBeGreaterThan(0);
  });
});
