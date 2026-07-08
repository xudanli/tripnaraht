import { LegacyCandidateGenerationProvider } from './legacy-candidate-generation.provider';
import type { LegacyTripPlanningAdapter } from '../legacy-planning.adapter';

describe('LegacyCandidateGenerationProvider', () => {
  it('wraps legacy adapter with provider contract', async () => {
    const provider = new LegacyCandidateGenerationProvider({
      generateCandidates: async () => [
        {
          candidateId: 'c1',
          label: 'A',
          source: 'LEGACY',
          plan: { tripId: 't1', days: [] } as any,
        },
      ],
    } as unknown as LegacyTripPlanningAdapter);

    const result = await provider.generateCandidates(
      { context: { tripId: 't1' } } as any,
      { tripId: 't1' },
    );

    expect(result.schemaId).toBe('tripnara.candidate_generation_result@v1');
    expect(result.providerId).toBe('legacy-trip-planning');
    expect(result.candidates).toHaveLength(1);
  });
});
