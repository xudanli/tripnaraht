import {
  projectEpisodeToKnowledgeCase,
  scoreSimilarCase,
} from './project-episode-to-case.util';
import { KnowledgeDecisionCaseService } from './knowledge-decision-case.service';
import { DECISION_EPISODE_SCHEMA, type DecisionEpisodeV1 } from '../../travel-memory/episode/decision-episode.types';

function sampleEpisode(partial?: Partial<DecisionEpisodeV1>): DecisionEpisodeV1 {
  return {
    schemaId: DECISION_EPISODE_SCHEMA,
    version: 1,
    episodeId: 'ep-test-1',
    context: {
      tripId: 'trip-1',
      day: 1,
      weatherRisk: 'HIGH',
      decisionType: 'ROUTE',
      worldStateNote: 'F208 CLOSED',
    },
    decision: {
      type: 'F_ROAD_CONTINUE',
      alternatives: ['CONTINUE_F208', 'DETOUR_RING'],
      recommended: 'DETOUR_RING',
    },
    userAction: { type: 'ACCEPT', selected: 'DETOUR_RING' },
    outcome: {
      completed: true,
      fatigue: 'LOW',
      scheduleDelayMinutes: 30,
      safetyIncident: false,
    },
    reflection: { decisionRegret: 0.15 },
    mayPromoteToPreference: false,
    ...partial,
  };
}

describe('projectEpisodeToKnowledgeCase', () => {
  it('projects episode fields into searchable case', () => {
    const c = projectEpisodeToKnowledgeCase({
      episode: sampleEpisode(),
      country: 'IS',
      situationSnapshotId: 'ws_1',
      durable: true,
    });
    expect(c.schemaId).toBe('tripnara.knowledge_decision_case@v1');
    expect(c.caseId).toBe('kdc_ep-test-1');
    expect(c.country).toBe('IS');
    expect(c.decisionType).toBe('F_ROAD_CONTINUE');
    expect(c.riskType).toBe('WEATHER');
    expect(c.outcome.label).toBe('SUCCESS');
    expect(c.regret).toBe('LOW');
    expect(c.userChoice.action).toBe('ACCEPT');
    expect(c.situationTags.some((t) => t.startsWith('risk:'))).toBe(true);
    expect(c.durable).toBe(true);
  });

  it('maps high regret + incomplete to FAILURE / HIGH', () => {
    const c = projectEpisodeToKnowledgeCase({
      episode: sampleEpisode({
        episodeId: 'ep-bad',
        userAction: { type: 'OVERRIDE', selected: 'CONTINUE_F208' },
        outcome: { completed: false, safetyIncident: false },
        reflection: { decisionRegret: 0.9 },
      }),
    });
    expect(c.outcome.label).toBe('FAILURE');
    expect(c.regret).toBe('HIGH');
  });
});

describe('scoreSimilarCase', () => {
  it('scores country + decisionType + tags', () => {
    const a = projectEpisodeToKnowledgeCase({
      episode: sampleEpisode(),
      country: 'IS',
    });
    const b = projectEpisodeToKnowledgeCase({
      episode: sampleEpisode({ episodeId: 'ep-2' }),
      country: 'IS',
    });
    expect(scoreSimilarCase(a, b)).toBeGreaterThan(5);
    const other = projectEpisodeToKnowledgeCase({
      episode: sampleEpisode({
        episodeId: 'ep-3',
        decision: {
          type: 'LODGING_SWAP',
          alternatives: ['A', 'B'],
          recommended: 'A',
        },
        context: {
          tripId: 't',
          weatherRisk: 'LOW',
          decisionType: 'LODGING',
        },
      }),
      country: 'NO',
    });
    expect(scoreSimilarCase(a, other)).toBeLessThan(scoreSimilarCase(a, b));
  });
});

describe('KnowledgeDecisionCaseService', () => {
  const prismaStub = {
    isDbConnected: () => false,
    knowledgeDecisionCase: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  it('lists demos and finds similar F208 cases', async () => {
    const svc = new KnowledgeDecisionCaseService(
      { getRelevantDecisions: () => [] } as never,
      prismaStub as never,
    );
    await svc.onModuleInit();
    const listed = svc.list({ country: 'IS', decisionType: 'F_ROAD' });
    expect(listed.total).toBeGreaterThanOrEqual(2);
    const seed = listed.items[0];
    const sim = await svc.similar(seed.caseId);
    expect(sim.items.length).toBeGreaterThan(0);
    expect(sim.items[0].similarityScore).toBeGreaterThan(0);
    const cov = svc.coverageStats();
    expect(cov.decisionCaseCaptureRate).toBeGreaterThan(0);
    expect(cov.caseCount).toBe(3);
  });

  it('ingests arbitrary episode into registry', async () => {
    const svc = new KnowledgeDecisionCaseService(
      {
        getRelevantDecisions: () => [sampleEpisode({ episodeId: 'from-hot' })],
      } as never,
      prismaStub as never,
    );
    await svc.onModuleInit();
    const r = svc.reprojectFromRuntime({ country: 'IS' });
    expect(r.ingested).toBe(1);
    expect(svc.get('kdc_from-hot').episodeId).toBe('from-hot');
  });
});
