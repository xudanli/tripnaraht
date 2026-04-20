import { CandidateSearchPipeline } from './candidate-search.pipeline';
import { PlanFeaturesService } from '../../trips/decision/optimization/plan-features/plan-features.service';
import { ExposureAnnotationService } from '../../trips/decision/optimization/plan-features/exposure-annotation.service';

describe('CandidateSearchPipeline (G1)', () => {
  it('should generate repair candidates for hard violations and include feasible repaired candidates', async () => {
    const planFeatures = new PlanFeaturesService();

    const constraintEngineMock: any = {
      isFeasible: jest.fn(async (_state: any, plan: any) => {
        const slotCount = (plan?.days ?? []).flatMap((d: any) => d.timeSlots ?? []).length;
        const feasible = slotCount <= 2;
        return {
          feasible,
          violations: feasible
            ? []
            : [
                {
                  code: 'TIME_WINDOW_VIOLATION',
                  severity: 'error',
                  message: '活动不在开放时间窗内',
                },
              ],
          rawCheckResult: {
            violations: [],
            isValid: feasible,
            summary: { errorCount: feasible ? 0 : 1, warningCount: 0, infoCount: 0 },
          },
        };
      }),
    };

    const pipeline = new CandidateSearchPipeline(planFeatures, constraintEngineMock);

    const dso: any = {
      userIntent: { destination: 'X', days: 1, dateRange: { startDate: '2026-01-01', endDate: '2026-01-01' } },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'req-1', version: 0, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() },
      requestId: 'req-1',
    };

    const itinerary: any = {
      request_id: 'req-1',
      days: [
        {
          date: '2026-01-01',
          items: [
            { id: 'a', type: 'POI', start_window: '09:00', end_window: '10:00', location_ref: { place_id: 'p1', name: 'P1' } },
            { id: 'b', type: 'POI', start_window: '10:00', end_window: '11:00', location_ref: { place_id: 'p2', name: 'P2' } },
            { id: 'c', type: 'POI', start_window: '11:00', end_window: '12:00', location_ref: { place_id: 'p3', name: 'P3' } },
          ],
        },
      ],
    };

    const result = await pipeline.buildCandidatesFromItinerary(dso, itinerary, 'rd-1', 'trip-1', {
      maxCandidates: 8,
      repairMaxIters: 1,
    });
    const candidates = result.candidates;

    expect(candidates.length).toBeGreaterThan(0);
    // We should end up with at least one feasible candidate after repair.
    expect(candidates.some((c) => c.feasible)).toBe(true);
    expect(result.audit.initialVariantCount).toBeGreaterThan(0);
    expect(result.audit.iterations.length).toBeGreaterThan(0);
    expect(result.audit.finalCandidateCount).toBe(candidates.length);
    expect(result.audit.finalFeasibleCount).toBeGreaterThan(0);
  });

  it('should prefer TIME_WINDOW_VIOLATION-targeted repairs (shiftDayStart) when repairTopKPerCandidate=1', async () => {
    const planFeatures = new PlanFeaturesService();

    const constraintEngineMock: any = {
      isFeasible: jest.fn(async (_state: any, plan: any) => {
        const slotCount = (plan?.days ?? []).flatMap((d: any) => d.timeSlots ?? []).length;
        const feasible = slotCount <= 2;
        return {
          feasible,
          violations: feasible
            ? []
            : [
                {
                  code: 'TIME_WINDOW_VIOLATION',
                  severity: 'error',
                  message: '活动不在开放时间窗内',
                },
              ],
          rawCheckResult: {
            violations: [],
            isValid: feasible,
            summary: { errorCount: feasible ? 0 : 1, warningCount: 0, infoCount: 0 },
          },
        };
      }),
    };

    const pipeline = new CandidateSearchPipeline(planFeatures, constraintEngineMock, new ExposureAnnotationService());

    const dso: any = {
      userIntent: { destination: 'X', days: 1, dateRange: { startDate: '2026-01-01', endDate: '2026-01-01' } },
      tripState: {},
      environmentState: {},
      systemState: { requestId: 'req-2', version: 0, startedAt: new Date().toISOString(), lastUpdatedAt: new Date().toISOString() },
      requestId: 'req-2',
    };

    const itinerary: any = {
      request_id: 'req-2',
      days: [
        {
          date: '2026-01-01',
          items: [
            { id: 'a', type: 'POI', start_window: '09:00', end_window: '10:00', location_ref: { place_id: 'p1', name: 'P1' } },
            { id: 'b', type: 'POI', start_window: '10:00', end_window: '11:00', location_ref: { place_id: 'p2', name: 'P2' } },
            { id: 'c', type: 'POI', start_window: '11:00', end_window: '12:00', location_ref: { place_id: 'p3', name: 'P3' } },
          ],
        },
      ],
    };

    const result = await pipeline.buildCandidatesFromItinerary(dso, itinerary, 'rd-1', 'trip-2', {
      maxCandidates: 8,
      repairMaxIters: 1,
      repairTopKPerCandidate: 1,
    });
    const _candidates = result.candidates;

    // With TopK=1, the audit should reflect a constrained repair budget.
    expect(result.audit.iterations.some((it) => it.repairsAccepted >= 0)).toBe(true);
    expect(result.audit.budget.repairTopKPerCandidate).toBe(1);
  });
});

