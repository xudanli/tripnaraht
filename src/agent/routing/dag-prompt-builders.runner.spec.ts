import {
  buildRoutingPrompt,
  buildSkillsSelectionPrompt,
} from './dag-prompt-builders.runner';

describe('dag-prompt-builders.runner', () => {
  it('includes intent analysis JSON in routing prompt', () => {
    const prompt = buildRoutingPrompt({ intent: 'plan' } as any);
    expect(prompt).toContain('"intent": "plan"');
  });

  it('lists available skills', () => {
    const prompt = buildSkillsSelectionPrompt({} as any, {} as any, [
      { name: 'poi.search', description: '找点' },
    ]);
    expect(prompt).toContain('poi.search');
    expect(prompt).toContain('找点');
  });
});
