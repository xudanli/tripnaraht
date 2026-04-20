import { buildLiteCandidates } from './cgus-replay-suite.util';
import { PlanFeaturesService } from '../optimization/plan-features/plan-features.service';

describe('cgus replay suite lite candidates', () => {
  it('marks only repair candidates feasible when HARD violations injected', () => {
    const planDraft: any = {
      request_id: 'req-1',
      days: [
        {
          date: '2026-06-01',
          items: [
            {
              location_ref: { id: 'poi-1', name: 'POI 1' },
              start_time: '09:00',
              end_time: '10:00',
            },
          ],
        },
      ],
    };

    const dso: any = {
      requestId: 'req-1',
      tripState: { planDraft },
      environmentState: { routeDirectionId: 'rd-1', countryCode: 'IS' },
      systemState: { requestId: 'req-1', currentPhase: 'OPTIMIZE' },
      constraints: {
        feasible: false,
        violations: [
          { type: 'TIME_WINDOW_VIOLATION', severity: 'HARD', degree: 1, detail: 'injected' },
        ],
      },
    };

    const planFeatures = new PlanFeaturesService();
    const candidates = buildLiteCandidates({ dso, maxCandidates: 8, planFeatures });

    // We expect at least one repair candidate (if RepairOperators can suggest any).
    expect(candidates.length).toBeGreaterThan(0);

    const feasible = candidates.filter((c) => c.feasible);
    const infeasible = candidates.filter((c) => !c.feasible);

    // Infeasible candidates should carry injected HARD violations.
    expect(infeasible.length).toBeGreaterThanOrEqual(1);
    for (const c of infeasible) {
      expect(c.constraintViolations.some((v) => v.severity === 'HARD')).toBe(true);
    }

    // Feasible candidates should not carry injected HARD violations.
    for (const c of feasible) {
      expect(c.constraintViolations.length).toBe(0);
    }
  });
});

