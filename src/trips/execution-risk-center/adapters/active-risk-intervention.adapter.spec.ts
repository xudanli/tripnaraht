import {
  enrichInterventionWithRiskLinks,
  findLinkedRisksForDecisionProblem,
  projectActiveRiskToIntervention,
} from '../adapters/active-risk-intervention.adapter';
import { projectConsumerToIntervention } from '../utils/execution-intervention.projection.util';
import { buildHarnessActiveRisks } from '../harness/execution-risk-p0.harness.util';
import type { ConsumerDecisionItem } from '../../travel-status/types/travel-status.types';

describe('active-risk-intervention.adapter', () => {
  const windRisk = buildHarnessActiveRisks().find((r) => r.code === 'WEATHER_STRONG_WIND')!;

  it('projects risk-only intervention when no decision problem exists', () => {
    const intervention = projectActiveRiskToIntervention(windRisk, 'trip_1', '2026-07-08T18:00:00Z');
    expect(intervention).not.toBeNull();
    expect(intervention!.linkedRiskIds).toEqual([windRisk.id]);
    expect(intervention!.recommendationId).toBeDefined();
    expect(intervention!.id).toBe(`intervention-risk-${windRisk.id}`);
  });

  it('links decision intervention to matching active risk', () => {
    const risks = buildHarnessActiveRisks().map((r) =>
      r.decisionProblemIds.length > 0
        ? {
            ...r,
            affectedMembers: [
              { id: 'u1', label: 'Patrick', kind: 'member' as const },
              { id: 'u2', label: 'Abu', kind: 'member' as const },
            ],
          }
        : r,
    );
    const blockRisk = risks.find((r) => r.decisionProblemIds.length > 0)!;
    const linked = findLinkedRisksForDecisionProblem(risks, blockRisk.decisionProblemIds[0]!);
    expect(linked.length).toBeGreaterThan(0);

    const consumer: ConsumerDecisionItem = {
      schemaId: 'tripnara.consumer_decision_item@v1',
      problemId: blockRisk.decisionProblemIds[0]!,
      headline: blockRisk.title,
      impact: blockRisk.summary,
      explanation: blockRisk.summary,
      severity: 'BLOCK',
      actions: {
        acceptRecommended: { enabled: true, actionId: 'a1' },
        keepOriginal: { enabled: true, actionId: 'k1' },
        viewAlternatives: { enabled: true, count: 1 },
        defer: { enabled: true, actionId: 'd1' },
      },
    };

    const intervention = enrichInterventionWithRiskLinks(
      projectConsumerToIntervention({
        consumer,
        tripId: 'trip_1',
        memberNamesById: new Map(),
        activityTitleById: new Map(),
      }),
      risks,
    );
    expect(intervention.linkedRiskIds).toContain(blockRisk.id);
    expect(intervention.primaryRiskId).toBe(blockRisk.id);
    expect(intervention.affectedMembers).toEqual(['Patrick', 'Abu']);
  });

  it('skips risk with decision problem id (handled by decision queue item)', () => {
    const blockRisk = buildHarnessActiveRisks().find((r) => r.decisionProblemIds.length > 0)!;
    expect(projectActiveRiskToIntervention(blockRisk, 'trip_1')).toBeNull();
  });
});
