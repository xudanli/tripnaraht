import { buildIcelandCausalTraceSeed } from '../adapters/iceland-causal-trace.adapter';
import { CANONICAL_CAUSAL_TRACE_SCHEMA } from '../causal-trace.types';
import {
  projectCausalStoryView,
  projectNeutralCausalStoryView,
} from '../projectors/causal-story-view.projector';

describe('causal-story-view.projector', () => {
  const seed = buildIcelandCausalTraceSeed({
    tripId: 'trip-1',
    problemId: 'problem-1',
    destination: 'IS',
    routeLabel: '蓝湖温泉 → 哈尔格林姆斯教堂',
    diagnosticMessage: '蓝湖温泉 → 哈尔格林姆斯教堂 46分钟',
    windMps: 27,
    appointmentSlackMinutes: 10,
  });

  const trace = {
    schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
    traceId: 'ct_test',
    tripId: 'trip-1',
    worldStateVersion: 'ws_v1',
    createdAt: '2026-07-06T00:00:00.000Z',
    updatedAt: '2026-07-06T00:00:00.000Z',
    trigger: { type: 'DECISION_PROBLEM_OPEN', source: 'iceland', observedAt: '2026-07-06T00:00:00.000Z' },
    facts: seed!.facts,
    effects: seed!.effects,
    problems: [seed!.problem],
    options: [{ optionId: 'depart_45min_earlier', problemId: 'problem-1' }],
    selectedOptionId: 'depart_45min_earlier',
    status: 'PREVIEW' as const,
  };

  it('projects neutral story without internal variable ids', () => {
    const story = projectNeutralCausalStoryView(trace);
    const serialized = JSON.stringify(story);
    expect(serialized).not.toContain('environment:wind_mps');
    expect(serialized).not.toContain('wind_mps');
    expect(story.headline).toContain('蓝湖');
    expect(story.chain.some((n) => n.type === 'WORLD_CHANGE')).toBe(true);
    expect(story.chain.some((n) => n.type === 'IMPACT')).toBe(true);
    expect(story.chain.some((n) => n.type === 'CONFLICT')).toBe(true);
    expect(story.chain.some((n) => n.type === 'OPTION')).toBe(true);
    expect(story.chain[0]?.description).toMatch(/m\/s|阵风/);
  });

  it('Abu projection keeps numbers but changes safety framing', () => {
    const neutral = projectNeutralCausalStoryView(trace);
    const abu = projectCausalStoryView(trace, 'abu');
    expect(abu.headline).toContain('安全');
    expect(abu.assessment).toMatch(/%|风险/);
    expect(abu.chain.length).toBe(neutral.chain.length);
    expect(abu.traceId).toBe(neutral.traceId);
  });

  it('includes OUTCOME node when trace is CALIBRATED', () => {
    const calibrated = {
      ...trace,
      status: 'CALIBRATED' as const,
      calibration: {
        outcomeRef: 'res-1',
        predictedMinutes: 48,
        actualMinutes: 61,
        predictionErrorMinutes: 13,
        evaluatedAt: '2026-07-06T00:00:00.000Z',
      },
    };
    const story = projectNeutralCausalStoryView(calibrated);
    expect(story.chain.some((n) => n.type === 'OUTCOME')).toBe(true);
    expect(story.chain.find((n) => n.type === 'OUTCOME')?.description).toContain('13');
  });
});
