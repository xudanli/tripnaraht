import {
  lexiconMatchFourWheelIntent,
  lexiconMatchTwoWheelIntent,
  normalizeIcelandVehicleIntentText,
} from './iceland-intent-vehicle-lexicon';

describe('iceland-intent-vehicle-lexicon', () => {
  it('normalizeIcelandVehicleIntentText strips combining marks (Norðurland + duster)', () => {
    const n = normalizeIcelandVehicleIntentText('Trip in Norðurland with Dacia Duster');
    expect(lexiconMatchFourWheelIntent(n)).toBe(true);
    expect(lexiconMatchTwoWheelIntent(n)).toBe(false);
  });

  it('lexiconMatchTwoWheelIntent matches 雅力士 without word boundaries', () => {
    const n = normalizeIcelandVehicleIntentText('我们租丰田雅力士去高地');
    expect(lexiconMatchTwoWheelIntent(n)).toBe(true);
  });

  it('4WD bucket wins over economy substring when Duster present', () => {
    const n = normalizeIcelandVehicleIntentText('economy duster rental');
    expect(lexiconMatchFourWheelIntent(n)).toBe(true);
  });

  it('does not treat FITNESS_PROFILE / outfit / benefit as Honda Fit', () => {
    for (const raw of [
      '[SYSTEM_MESSAGE][FITNESS_PROFILE]\nmoderate band',
      'outfit for glacier hike',
      'benefit of early sunrise',
    ]) {
      expect(lexiconMatchTwoWheelIntent(normalizeIcelandVehicleIntentText(raw))).toBe(false);
    }
  });

  it('still matches whole-word Honda Fit / Jazz', () => {
    expect(lexiconMatchTwoWheelIntent(normalizeIcelandVehicleIntentText('rent a Honda Fit'))).toBe(true);
    expect(lexiconMatchTwoWheelIntent(normalizeIcelandVehicleIntentText('Honda Jazz 1.2'))).toBe(true);
  });
});
