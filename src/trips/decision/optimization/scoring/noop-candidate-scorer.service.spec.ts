import { NoopCandidateScorerService } from './noop-candidate-scorer.service';
import { latentSnapshotFromWorldContext } from './latent-from-world-context';

describe('NoopCandidateScorerService', () => {
  it('returns one row per candidate', async () => {
    const svc = new NoopCandidateScorerService();
    const world: any = {
      physical: { month: 1, climateSeasonality: { accessibilityScore: 0.9 } },
      human: { fitnessScore: 70, riskTolerance: 'LOW' },
      routeDirection: { id: 'r1', name: 'R' },
    };
    const latent = latentSnapshotFromWorldContext(world);
    const out = await svc.score({
      candidates: [
        { id: 'a', feasible: true, plan: { tripId: 't', routeDirectionId: 'r1', segments: [] } as any },
        { id: 'b', feasible: true },
      ],
      worldContext: world,
      latent,
      mode: 'shadow',
    });
    expect(out.perCandidate).toHaveLength(2);
    expect(out.perCandidate.map((p) => p.candidateId).sort()).toEqual(['a', 'b']);
    expect(out.modelVersion).toContain('noop');
  });
});
