import {
  buildPersonalizedPercentages,
  buildStructurePresets,
  CANONICAL_STRUCTURE_PRESETS,
  resolveDefaultStructurePercentages,
} from './structure-presets.util';
import type { MoneyDnaProfile } from '../types/value-feedback.types';

const baseMoneyDna = (overrides: Partial<MoneyDnaProfile> = {}): MoneyDnaProfile => ({
  userId: 'user-1',
  experienceSensitivity: 0.8,
  accommodationSensitivity: 0.4,
  efficiencySensitivity: 0.3,
  frugalityIndex: 0.2,
  dominantPersona: 'experience',
  tripCount: 3,
  lastUpdatedAt: '2026-06-16T00:00:00.000Z',
  confidence: 0.7,
  ...overrides,
});

describe('structure-presets.util', () => {
  it('returns balanced canonical preset when no Money DNA', () => {
    const resolved = resolveDefaultStructurePercentages(null);
    expect(resolved.spendingPersona).toBe('balanced');
    expect(resolved.source).toBe('canonical');
    expect(resolved.percentages.experience).toBe(25);
  });

  it('falls back to balanced when Money DNA confidence is very low', () => {
    const resolved = resolveDefaultStructurePercentages(
      baseMoneyDna({ confidence: 0.1, tripCount: 0 }),
    );
    expect(resolved.spendingPersona).toBe('balanced');
    expect(resolved.source).toBe('canonical');
  });

  it('uses dominant persona canonical preset for early-stage Money DNA', () => {
    const resolved = resolveDefaultStructurePercentages(
      baseMoneyDna({ confidence: 0.25, tripCount: 1 }),
    );
    expect(resolved.spendingPersona).toBe('experience');
    expect(resolved.percentages.experience).toBe(50);
  });

  it('builds personalized percentages for mature Money DNA', () => {
    const pct = buildPersonalizedPercentages(baseMoneyDna());
    const sum =
      pct.transportation +
      pct.accommodation +
      pct.experience +
      pct.food +
      (pct.other ?? 0);
    expect(sum).toBe(100);
    expect(pct.experience).toBeGreaterThan(pct.accommodation);
  });

  it('marks recommended preset from Money DNA', () => {
    const { presets, recommendedPersona } = buildStructurePresets(baseMoneyDna());
    expect(recommendedPersona).toBe('experience');
    expect(presets.some((p) => p.recommended)).toBe(true);
    expect(presets.find((p) => p.id === 'personalized')).toBeDefined();
  });

  it('includes all canonical presets', () => {
    const { presets } = buildStructurePresets(null);
    for (const canonical of CANONICAL_STRUCTURE_PRESETS) {
      expect(presets.some((p) => p.id === canonical.id)).toBe(true);
    }
  });
});
