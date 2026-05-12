import {
  ICELAND_INSURANCE_LEXICON,
  insuranceLexiconMatchAny,
} from './iceland-insurance-lexicon';

/** OTA / 车行「数字考古」样例：随真实字段积累，用例应只增不减 */
const OTA_INSURANCE_TEXT_FIXTURES: ReadonlyArray<{
  scenario: string;
  insurance_text: string;
  expect: { zero: boolean; gravel: boolean; sandAsh: boolean };
}> = [
  {
    scenario: 'Booking 混合包',
    insurance_text:
      'Collision Damage Waiver, Theft Protection, Third Party Liability, Gravel Protection',
    expect: { zero: false, gravel: true, sandAsh: false },
  },
  {
    scenario: 'Rentalcars 模糊词',
    insurance_text: 'Full Insurance with Zero Deductible and glass/tire protection',
    expect: { zero: true, gravel: false, sandAsh: false },
  },
  {
    scenario: '车行直联 API',
    insurance_text: 'CDW, TP, SCDW, SAAP, GP, TP, liability-release-premium',
    expect: { zero: true, gravel: true, sandAsh: true },
  },
  {
    scenario: '中文镜像流',
    insurance_text: '全险自驾，已含起步险、碎石险、火山灰险',
    expect: { zero: true, gravel: true, sandAsh: true },
  },
];

describe('iceland-insurance-lexicon', () => {
  it('detects Blue Liability Release as zero-tier', () => {
    const t = 'Blue Car Rental Liability Release package';
    expect(insuranceLexiconMatchAny(t, ICELAND_INSURANCE_LEXICON.ZERO_EXCESS)).toBe(true);
  });

  it('detects Lotus Platinum', () => {
    expect(insuranceLexiconMatchAny('Lotus Platinum insurance', ICELAND_INSURANCE_LEXICON.ZERO_EXCESS)).toBe(true);
  });

  it('detects SAAP', () => {
    expect(insuranceLexiconMatchAny('includes SAAP coverage', ICELAND_INSURANCE_LEXICON.SAND_ASH)).toBe(true);
  });

  it('OTA / Booking insurance_text fixtures (archaeology)', () => {
    for (const row of OTA_INSURANCE_TEXT_FIXTURES) {
      const { insurance_text, expect: e } = row;
      expect(insuranceLexiconMatchAny(insurance_text, ICELAND_INSURANCE_LEXICON.ZERO_EXCESS)).toBe(e.zero);
      expect(insuranceLexiconMatchAny(insurance_text, ICELAND_INSURANCE_LEXICON.GRAVEL)).toBe(e.gravel);
      expect(insuranceLexiconMatchAny(insurance_text, ICELAND_INSURANCE_LEXICON.SAND_ASH)).toBe(e.sandAsh);
    }
  });

  it('does not treat bare CDW as zero-excess tier', () => {
    const t = 'CDW, TP, Third Party Liability only';
    expect(insuranceLexiconMatchAny(t, ICELAND_INSURANCE_LEXICON.ZERO_EXCESS)).toBe(false);
  });
});
