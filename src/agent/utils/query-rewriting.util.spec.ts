import {
  applyQueryRewriteToToolParams,
  assembleQueryRewriteResult,
  buildStage1FromExactEntity,
  detectDestinationSwitch,
  parseQueryRewriteResponse,
  postProcessStandardization,
  rewriteQueryWithRules,
} from './query-rewriting.util';
import type { QueryRewriteScene } from './query-rewriting.types';
import { QueryRewritingDictionaryService } from '../services/query-rewriting-dictionary.service';

const ANCHOR_NOW = new Date('2026-06-09T12:00:00.000Z');

function assembleFromStage1(
  stage1: ReturnType<typeof rewriteQueryWithRules>,
  scene: QueryRewriteScene,
) {
  return assembleQueryRewriteResult(stage1, { query: stage1.original_query, scene }, {
    stage1_source: 'rules',
    stage2_deterministic: true,
    stage2_generative: false,
  });
}

describe('query-rewriting.util', () => {
  it('补全会话上下文：三亚海景酒店 + 要带宠物的', () => {
    const stage1 = rewriteQueryWithRules({
      query: '要带宠物的',
      scene: 'accommodation',
      session: {
        selectedDestination: '三亚',
        messageHistory: [{ role: 'user', content: '三亚海景酒店' }],
      },
    });
    const result = assembleFromStage1(stage1, 'accommodation');

    expect(result.contextualized_query).toContain('三亚');
    expect(result.contextualized_query).toMatch(/允许携带宠物|宠物友好/);
    expect(result.standardized_query.destination).toBe('三亚');
    expect(result.expansion_routes.scenario).toContain('允许携带宠物');
  });

  it('时空对齐：北京 + 明天去周边的温泉', () => {
    const stage1 = rewriteQueryWithRules({
      query: '明天去周边的温泉',
      scene: 'accommodation',
      spatioTemporal: {
        now: ANCHOR_NOW,
        locationLabel: '北京',
      },
    });
    const result = assembleFromStage1(stage1, 'accommodation');

    expect(result.contextualized_query).toContain('北京');
    expect(result.contextualized_query).toMatch(/温泉/);
    expect(result.contextualized_query).toContain('2026-06-10');
    expect(result.expansion_routes.scenario).toContain('温泉度假村');
  });

  it('隐式意图：适合结婚纪念日的地方', () => {
    const stage1 = rewriteQueryWithRules({
      query: '适合结婚纪念日的地方',
      scene: 'general',
    });
    const result = assembleFromStage1(stage1, 'general');

    expect(result.expansion_routes.scenario).toEqual(
      expect.arrayContaining(['浪漫', '蜜月套房', '高星酒店']),
    );
  });

  it('纠错与归一化：香格里拉 记念碑 附近 旅馆', () => {
    const result = rewriteQueryWithRules({
      query: '香格里拉 记念碑 附近 旅馆',
      scene: 'accommodation',
    });

    expect(result.contextualized_query).toContain('纪念碑');
    expect(result.standardized_query.poi).toBe('香格里拉红军长征博物馆');
    expect(result.standardized_query.category).toBe('酒店');
  });

  it('别名映射：大苹果 自由女神 / LA 迪士尼', () => {
    const ny = rewriteQueryWithRules({ query: '大苹果 自由女神', scene: 'poi' });
    expect(ny.contextualized_query).toContain('纽约');
    expect(ny.standardized_query.destination).toBe('纽约');
    expect(ny.standardized_query.poi).toBe('自由女神像');

    const la = rewriteQueryWithRules({ query: 'LA 迪士尼', scene: 'accommodation' });
    expect(la.contextualized_query).toContain('洛杉矶');
    expect(la.standardized_query.poi).toBe('迪士尼乐园');
  });

  it('结构化场景：上海迪士尼高档酒店', () => {
    const result = rewriteQueryWithRules({
      query: '过几天想去上海迪士尼住一晚稍微好点的酒店',
      scene: 'accommodation',
    });

    expect(result.standardized_query.destination).toBe('上海');
    expect(result.standardized_query.poi).toBe('迪士尼乐园');
    expect(result.standardized_query.category).toBe('酒店');
    expect(result.standardized_query.rank_level).toBe('4星/5星/高档');
  });

  it('parseQueryRewriteResponse 在非法 JSON 时降级', () => {
    const fallbackInput = {
      query: '要带宠物的',
      scene: 'accommodation' as const,
      session: { selectedDestination: '三亚' },
    };
    const parsed = parseQueryRewriteResponse('not-json', fallbackInput);
    expect(parsed.contextualized_query).toContain('三亚');
  });

  it('检测目的地切换：改去大阪时不继承东京会话', () => {
    expect(detectDestinationSwitch('算了，改去大阪吧')).toBe(true);
    const result = rewriteQueryWithRules({
      query: '算了，改去大阪吧',
      scene: 'hotel',
      session: { selectedDestination: '东京' },
    });
    expect(result.discard_previous_destination).toBe(true);
    expect(result.standardized_query.destination).toBe('大阪');
    expect(result.contextualized_query).not.toContain('东京');
  });

  it('postProcessStandardization 约束 destination 在候选词表内', () => {
    const dict = new QueryRewritingDictionaryService();
    const stage1 = rewriteQueryWithRules({
      query: '大苹果 自由女神',
      scene: 'poi',
    });
    const candidates = dict.findRoughCandidates('大苹果 自由女神');
    const result = postProcessStandardization(stage1, { query: '大苹果 自由女神', scene: 'poi' }, {
      normalizeEntity: (raw) => dict.normalizeEntity(raw),
      constrainDestination: (dest, c) => dict.constrainDestination(dest, c),
      candidateEntities: candidates,
    });
    expect(result.standardized_query.destination).toBe('纽约');
    expect(result.standardized_query.poi).toBe('自由女神像');
  });

  it('buildStage1FromExactEntity 注入标准目的地', () => {
    const stage1 = buildStage1FromExactEntity(
      { query: '大苹果 海景酒店', scene: 'hotel' },
      {
        entity: { id: '纽约', name: '纽约', type: 'destination' },
        confidence: 0.94,
        skipStage1Llm: true,
        matchedAlias: '大苹果',
        source: 'memory',
      },
    );
    expect(stage1.contextualized_query).toMatch(/纽约/);
    expect(stage1.standardized_query.destination).toBe('纽约');
    expect(stage1.confidence).toBeGreaterThanOrEqual(0.92);
  });

  it('applyQueryRewriteToToolParams 合并住宿搜索参数', () => {
    const rewrite = rewriteQueryWithRules({
      query: 'LA 迪士尼 高档酒店',
      scene: 'accommodation',
    });
    const merged = applyQueryRewriteToToolParams({ destination: '洛杉矶' }, rewrite);
    expect(merged.query).toContain('洛杉矶');
    expect(merged.query).toContain('迪士尼乐园');
    expect(merged.minRating).toBe(4);
  });
});
