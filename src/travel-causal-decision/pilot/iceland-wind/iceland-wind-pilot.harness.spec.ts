/**
 * Iceland Wind Causal Decision Pilot Validation harness.
 *
 * Phase: Pilot Validation — prove deadline / intervention / reconciliation
 * value on 15–20 structured wind cases (not just unit green).
 */

import {
  buildIcelandWindPilotCaseRegistry,
  countByArchetype,
} from './wind-pilot-case.registry';
import { evaluateWindPilotSuite } from './evaluate-wind-pilot.util';
import { projectCausalDecisionCard } from '../../projectors/causal-decision-card.projector';

describe('Iceland Wind Causal Decision Pilot Validation', () => {
  const cases = buildIcelandWindPilotCaseRegistry();

  it('covers the required archetype counts (19 samples)', () => {
    const counts = countByArchetype(cases);
    expect(cases.length).toBe(19);
    expect(counts.WIND_NO_IMPACT).toBe(3);
    expect(counts.WIND_MINOR_DELAY_STILL_OK).toBe(3);
    expect(counts.FIX_BY_DEPART_EARLIER).toBe(3);
    expect(counts.FIX_BY_DROP_STOP).toBe(3);
    expect(counts.IRRECOVERABLE_REPLACE_OR_CANCEL).toBe(3);
    expect(counts.FORECAST_CHANGE_STALE_CONTEXT).toBe(2);
    expect(counts.INCOMPLETE_OBSERVATION).toBe(2);
  });

  it('each case retains full evidence bag', () => {
    for (const c of cases) {
      expect(c.schema).toBe('tripnara.iceland_wind_pilot_evidence@v1');
      expect(c.factSnapshot.windMps).toBeGreaterThan(0);
      expect(c.ruleVersion.length).toBeGreaterThan(0);
      expect(c.contextHash.length).toBeGreaterThan(0);
      expect(c.decision.causalChain.length).toBeGreaterThanOrEqual(1);
      expect(c.decision.temporalForecast.interventionDeadline).toBeTruthy();
      expect(c.irreparableAfterAt).toBeTruthy();
    }
  });

  it('presents a single root decision card (not derived-as-root)', () => {
    for (const c of cases.filter((x) => x.archetype !== 'WIND_NO_IMPACT')) {
      const card = projectCausalDecisionCard(c.decision);
      expect(c.expectedRootCauseSummaryZh).toContain('强风');
      expect(card.whyItMatters.length).toBeGreaterThanOrEqual(2);
      // Chain shows effects; card is one surface
      expect(card.whatHappened.length).toBeGreaterThan(0);
    }
  });

  it('suite meets Pilot pass criteria', () => {
    const report = evaluateWindPilotSuite(cases);
    if (!report.ok) {
      // Surface first failures for pilot debugging
      // eslint-disable-next-line no-console
      console.error(report.errors.slice(0, 8));
    }
    expect(report.metrics.caseCount).toBe(19);
    expect(report.metrics.recommendedValidationPassRate).toBe(1);
    expect(report.metrics.deadlineBeforeIrreparableRate).toBe(1);
    expect(report.metrics.incompleteObsUnobservableRate).toBe(1);
    expect(report.metrics.applyNotAutoConfirmRate).toBe(1);
    expect(report.ok).toBe(true);
  });

  it('incomplete observation cases are UNOBSERVABLE (not CONFIRMED)', () => {
    const incomplete = cases.filter((c) => c.archetype === 'INCOMPLETE_OBSERVATION');
    expect(incomplete.length).toBe(2);
    for (const c of incomplete) {
      expect(['UNOBSERVABLE', 'PENDING']).toContain(c.finalReconciliation);
      expect(c.decision.outcome?.reconciliation).not.toBe('CONFIRMED');
    }
  });
});
