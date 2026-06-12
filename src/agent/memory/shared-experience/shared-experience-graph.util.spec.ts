import { buildDecisionMemory } from '../decision-memory/decision-memory.types';
import type { AgentMemoryContext } from '../interfaces/agent-memory-context.interface';
import { projectSharedExperienceGraph } from './shared-experience-graph.util';

describe('shared-experience-graph.util', () => {
  it('合并 L2 WDMA 与 L4 feedback 并去重', () => {
    const memory = {
      recentWorldDecisions: [
        buildDecisionMemory({
          decisionType: 'weather_reroute',
          inputs: { tripId: 'trip-is-1', locationName: '西峡湾', tags: ['WIND_LOCK'] },
          outputs: {},
          outcome: 'failed',
          rationale: ['WEATHER_WIND_LOCK'],
          causedBy: ['storm'],
        }),
      ],
      recentTripFeedbacks: [
        {
          tripId: 'trip-xj-2',
          satisfactionScore: 2,
          fatigueLevel: 'HIGH',
          overallSuccess: false,
          abandoned: true,
          createdAt: new Date().toISOString(),
          primaryTags: ['独库公路', 'signal_loss'],
        },
      ],
    } as unknown as AgentMemoryContext;

    const graph = projectSharedExperienceGraph(memory, 'trip-current');
    expect(graph.sourceLayers).toEqual(expect.arrayContaining(['L2_WDMA', 'L4_TRIP_FEEDBACK']));
    expect(graph.anchors.length).toBeGreaterThanOrEqual(2);
    expect(graph.anchors.some((a) => a.legacyPreferenceToken === 'EXPERIENCED_HIGH_ANXIETY_IN_WIND')).toBe(
      true,
    );
    expect(graph.anchors.some((a) => a.legacyPreferenceToken === 'EXPERIENCED_SIGNAL_BLACKOUT')).toBe(
      true,
    );
  });

  it('跳过 currentTripId 自身反馈', () => {
    const memory = {
      recentTripFeedbacks: [
        {
          tripId: 'trip-current',
          satisfactionScore: 5,
          fatigueLevel: 'LOW',
          overallSuccess: true,
          abandoned: false,
          createdAt: new Date().toISOString(),
          primaryTags: [],
        },
      ],
    } as unknown as AgentMemoryContext;

    const graph = projectSharedExperienceGraph(memory, 'trip-current');
    expect(graph.anchors).toHaveLength(0);
  });
});
