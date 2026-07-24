import { QueryRewritingDictionaryService } from './query-rewriting-dictionary.service';

describe('QueryRewritingDictionaryService', () => {
  const dict = new QueryRewritingDictionaryService();

  it('findMatchingAliases 命中大苹果 / LA', () => {
    expect(dict.findMatchingAliases('大苹果 自由女神').map((a) => a.standard)).toContain('纽约');
    expect(dict.findMatchingAliases('LA 迪士尼').map((a) => a.standard)).toContain('洛杉矶');
  });

  it('buildKnowledgeGraphPromptSection 注入候选与别名', () => {
    const section = dict.buildKnowledgeGraphPromptSection('大苹果 酒店', '纽约');
    expect(section).toContain('知识图谱');
    expect(section).toContain('大苹果→纽约');
    expect(section).toContain('纽约');
  });

  it('resolveAliasesInText 归一化别名', () => {
    expect(dict.resolveAliasesInText('大苹果 记念碑')).toContain('纽约');
    expect(dict.resolveAliasesInText('大苹果 记念碑')).toContain('纪念碑');
  });
});
