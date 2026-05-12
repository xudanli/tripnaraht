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
});
