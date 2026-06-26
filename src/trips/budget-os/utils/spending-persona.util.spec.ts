import { inferSpendingPersona } from './spending-persona.util';

describe('inferSpendingPersona', () => {
  it('detects experience persona when experience >= 35% and dominant', () => {
    const result = inferSpendingPersona(
      {
        transportation: 1000,
        accommodation: 500,
        experience: 5000,
        food: 1500,
        other: 0,
      },
      8000,
    );
    expect(result.spendingPersona).toBe('experience');
    expect(result.personaConfidence).toBeGreaterThan(0);
  });

  it('detects quality persona when accommodation >= 35%', () => {
    const result = inferSpendingPersona(
      {
        transportation: 1000,
        accommodation: 5000,
        experience: 2000,
        food: 1500,
        other: 500,
      },
      10000,
    );
    expect(result.spendingPersona).toBe('quality');
  });

  it('detects frugal persona', () => {
    const result = inferSpendingPersona(
      {
        transportation: 4000,
        accommodation: 1000,
        experience: 1500,
        food: 3000,
        other: 500,
      },
      10000,
    );
    expect(result.spendingPersona).toBe('frugal');
  });

  it('falls back to balanced', () => {
    const result = inferSpendingPersona(
      {
        transportation: 2500,
        accommodation: 2500,
        experience: 2500,
        food: 2500,
        other: 0,
      },
      10000,
    );
    expect(result.spendingPersona).toBe('balanced');
  });
});
