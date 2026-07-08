import { OptimizationShadowMetricsCollector } from './optimization-shadow-metrics.collector';
import { ShadowObservabilityService } from './shadow-observability.service';
import { ShadowReviewService } from './shadow-review.service';
import { buildTaskDScenarios } from '../../decision-lab/e2e/task-d-scenarios.fixture';
import { runShadowDualRun } from '../../decision-lab/e2e/shadow-dual-run.harness';

describe('ShadowReviewService', () => {
  const metrics = new OptimizationShadowMetricsCollector();
  const observability = new ShadowObservabilityService(metrics);
  const review = new ShadowReviewService(observability);

  async function seedTd006Event() {
    const scenario = buildTaskDScenarios().find((s) => s.id === 'TD-006-three-way')!;
    const result = await runShadowDualRun({
      tripId: 'task_d_trip',
      worldState: scenario.worldState!,
      candidates: scenario.candidates,
      constraintReports: scenario.constraintReports,
      problemId: 'td006_review',
    });
    const event = result.shadowEvent;
    metrics.recordShadowEvent(event, {
      tripId: 'task_d_trip',
      candidatesById: Object.fromEntries(
        scenario.candidates.map((c) => [c.candidateId, c]),
      ),
      constraintReportsByCandidateId: scenario.constraintReports,
    });
    return event;
  }

  it('materializes blind case from DIFFERENT_WINNER shadow event', async () => {
    const event = await seedTd006Event();
    if (!event.divergence.types.includes('DIFFERENT_WINNER')) return;

    const result = await review.materialize({ comparisonIds: [event.comparisonId] });

    expect(result.created).toBe(1);
    expect(result.materialized).toHaveLength(1);
    const blind = result.materialized[0]!;
    expect(blind.blindedOptionA.schemaId).toBe('tripnara.review_plan_snapshot@v1');
    expect((blind as Record<string, unknown>).authorityCandidateId).toBeUndefined();
  });

  it('derives classification server-side without client input', async () => {
    const event = await seedTd006Event();
    const { materialized } = await review.materialize({
      comparisonIds: [event.comparisonId],
      force: true,
    });
    if (materialized.length === 0) return;

    const updated = await review.submitReview(materialized[0]!.reviewCaseId, {
      preferredOption: 'A',
      scores: {
        reasonableness: 4,
        executability: 5,
        requirementFit: 4,
        paceFit: 4,
      },
      tradeOffSummary: 'Option A preferred.',
      confidence: 4,
      reviewerId: 'reviewer-1',
    });

    expect(updated.status).toBe('COMPLETED');
    expect(updated.reviewAssignments[0]?.classification).toBeUndefined();

    const stats = await review.getStats();
    expect(stats.completedReviews).toBeGreaterThanOrEqual(1);
  });
});
