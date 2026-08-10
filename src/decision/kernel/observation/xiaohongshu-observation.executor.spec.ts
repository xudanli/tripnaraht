import { CompositeSnsObservationExecutor } from './xiaohongshu-observation.executor';
import type { ObservationToolExecutor } from './observation-harness.types';
import type { DecisionState } from '../decision-state.types';

describe('CompositeSnsObservationExecutor', () => {
  const dso = {
    userIntent: { destination: '冰岛' },
  } as DecisionState;

  it('uses Xiaohongshu for SNS when available', async () => {
    const xhs = {
      isServiceAvailable: () => true,
      searchAsExperienceBundle: jest.fn(async () => ({
        success: true,
        bundle: {
          query: '冰岛 路况',
          sampleSize: 2,
          stance: { worth: 1, skip: 0, conditional: 0, unclear: 1 },
          themes: [],
          risksMentioned: ['封路'],
          facts: [
            {
              factId: 'f1',
              title: '高地封路了',
              excerpt: '昨天 F 路封闭',
              disclaimerZh: '小红书社区体验，非官方事实',
            },
          ],
          evidenceRefs: ['f1'],
          disclaimerZh:
            '基于小红书社区体验抽样，非官方事实；与天气/道路/库存冲突时以官方传感器为准。',
          source: 'xiaohongshu',
        },
      })),
    };
    const fallback: ObservationToolExecutor = {
      execute: jest.fn(async () => ({
        evidenceKind: 'stub',
        evidenceWeight: 0,
        summary: 'fallback',
      })),
    };
    const exec = new CompositeSnsObservationExecutor(xhs as any, fallback);
    const out = await exec.execute(
      { type: 'OBSERVATION_SNS_CRAWL', queryTerms: ['路况'] },
      dso,
    );
    expect(out.provider).toBe('xiaohongshu');
    expect(out.evidenceKind).toBe('recent_social_image');
    expect(out.communityExperience).toBeTruthy();
    expect(out.summary).toContain('社区体验');
    expect(fallback.execute).not.toHaveBeenCalled();
  });

  it('falls back when Xiaohongshu has no samples', async () => {
    const xhs = {
      isServiceAvailable: () => true,
      searchAsExperienceBundle: jest.fn(async () => ({
        success: false,
        bundle: null,
        error: 'down',
      })),
    };
    const fallback: ObservationToolExecutor = {
      execute: jest.fn(async () => ({
        evidenceKind: 'stub',
        evidenceWeight: 0.1,
        summary: 'tavily-or-stub',
        provider: 'tavily',
      })),
    };
    const exec = new CompositeSnsObservationExecutor(xhs as any, fallback);
    const out = await exec.execute({ type: 'OBSERVATION_SNS_CRAWL' }, dso);
    expect(fallback.execute).toHaveBeenCalled();
    expect(out.summary).toBe('tavily-or-stub');
  });

  it('delegates non-SNS actions to fallback', async () => {
    const xhs = {
      isServiceAvailable: () => true,
      searchAsExperienceBundle: jest.fn(),
    };
    const fallback: ObservationToolExecutor = {
      execute: jest.fn(async () => ({
        evidenceKind: 'poi_operator',
        evidenceWeight: 0.5,
        summary: 'poi',
      })),
    };
    const exec = new CompositeSnsObservationExecutor(xhs as any, fallback);
    await exec.execute({ type: 'OBSERVATION_POI_VERIFY', poiId: 'p1' }, dso);
    expect(xhs.searchAsExperienceBundle).not.toHaveBeenCalled();
    expect(fallback.execute).toHaveBeenCalled();
  });
});
