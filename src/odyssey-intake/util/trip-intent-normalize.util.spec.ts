import { normalizeTripIntentInput } from './trip-intent-normalize.util';
import type { UpdateTripIntentInput } from '../dto/odyssey-intake.dto';

describe('trip-intent-normalize.util', () => {
  it('accepts tripIntentTag (frontend current format)', () => {
    expect(normalizeTripIntentInput({ tripIntentTag: 'budget_mode' } satisfies UpdateTripIntentInput)).toEqual([
      'budget_mode',
    ]);
  });

  it('accepts trip_intent_tag snake_case', () => {
    expect(normalizeTripIntentInput({ trip_intent_tag: 'open_to_match' } satisfies UpdateTripIntentInput)).toEqual([
      'open_to_match',
    ]);
  });

  it('accepts tripIntentTags array', () => {
    expect(
      normalizeTripIntentInput({ tripIntentTags: ['slow_pace', 'budget_mode'] } satisfies UpdateTripIntentInput),
    ).toEqual(['slow_pace', 'budget_mode']);
  });

  it('prefers tripIntentTag over tripIntentTags', () => {
    expect(
      normalizeTripIntentInput({
        tripIntentTag: 'budget_mode',
        tripIntentTags: ['slow_pace'],
      } satisfies UpdateTripIntentInput),
    ).toEqual(['budget_mode']);
  });

  it('rejects unknown tag id', () => {
    expect(() => normalizeTripIntentInput({ tripIntentTag: 'unknown_tag' } satisfies UpdateTripIntentInput)).toThrow(
      '未知的 tripIntentTag',
    );
  });
});
