import { createDefaultUserIntentState } from '../user-intent/intent-evolution.engine';
import { inferTravelPersonaFromUserIntent } from './persona-inference.engine';

describe('inferTravelPersonaFromUserIntent', () => {
  it('infers RELAXER from userInput', () => {
    const p = inferTravelPersonaFromUserIntent(undefined, { userInput: '轻松一点不要太赶' });
    expect(p.type).toBe('RELAXER');
  });

  it('infers FOODIE from food NL', () => {
    const p = inferTravelPersonaFromUserIntent(undefined, { userInput: '想吃好一点，美食为主' });
    expect(p.type).toBe('FOODIE');
  });

  it('uses low preferredPace in intent toward RELAXER', () => {
    const ui = createDefaultUserIntentState('x');
    ui.longTermProfile.preferredPace = 0.25;
    const p = inferTravelPersonaFromUserIntent(ui);
    expect(p.type).toBe('RELAXER');
  });
});
