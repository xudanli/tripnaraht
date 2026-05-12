import { compileRoundClarification } from './clarification-dsl-compiler';

describe('compileRoundClarification (DSL Compiler v0)', () => {
  it('produces ui schema, transition, pills, and llm context from round + questions', () => {
    const out = compileRoundClarification(
      { name: '体验偏好', roundId: 'round_2_experience' },
      [
        {
          id: 'is_travel_season',
          question: '你计划什么时候来冰岛？',
          type: 'single_choice',
          metadata: { fieldName: 'travelSeason' },
        },
        {
          id: 'is_activity_preference',
          question: '你最感兴趣的活动是什么？',
          type: 'multi_choice',
          metadata: { fieldName: 'activityPreferences' },
        },
      ],
    );

    expect(out.ui.cards).toHaveLength(2);
    expect(out.ui.cards[0].questionId).toBe('is_travel_season');
    expect(out.ui.cards[0].fieldName).toBe('travelSeason');
    expect(out.ui.plannerResponseBlockRefs).toEqual([
      { type: 'question_card', questionId: 'is_travel_season' },
      { type: 'question_card', questionId: 'is_activity_preference' },
    ]);
    expect(out.suggestedPills).toEqual(['你计划什么时候来冰岛？', '你最感兴趣的活动是什么？']);
    expect(out.transitionText).toContain('体验偏好');
    expect(out.llmPromptContext).toContain('travelSeason');
    expect(out.llmPromptContext).toContain('activityPreferences');
    expect(out.llmPromptContext).toContain('编号清单');
  });
});
