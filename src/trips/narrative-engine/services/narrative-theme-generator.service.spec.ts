import { NarrativeThemeGeneratorService } from './narrative-theme-generator.service';
import { encodeTravelStoryform } from '../encoders/travel-dna.encoder';

describe('NarrativeThemeGeneratorService', () => {
  const generator = new NarrativeThemeGeneratorService();

  it('generates three distinct arc templates via rules', () => {
    const storyform = encodeTravelStoryform({
      intake: { motivations: ['discovery'] },
    });
    const candidates = generator.generateViaRules(storyform);
    expect(candidates).toHaveLength(3);
    expect(candidates[0]!.arcTemplate).toBe('exploration');
    expect(candidates.every((c) => c.fallbackGenerated)).toBe(true);
    const arcs = new Set(candidates.map((c) => c.arcTemplate));
    expect(arcs.size).toBe(3);
  });

  it('uses mood keyword in primary title when present', () => {
    const storyform = encodeTravelStoryform({
      intake: { motivations: ['rest'], moodKeywords: ['风'] },
    });
    const [first] = generator.generateViaRules(storyform);
    expect(first!.title).toContain('风');
  });

  it('rotates secondary arcs on regenerate seed', () => {
    const storyform = encodeTravelStoryform({
      intake: { motivations: ['discovery'] },
    });
    const batch0 = generator.generateViaRules(storyform, 0);
    const batch1 = generator.generateViaRules(storyform, 1);
    expect(batch0[1]!.arcTemplate).not.toBe(batch1[1]!.arcTemplate);
  });
});
