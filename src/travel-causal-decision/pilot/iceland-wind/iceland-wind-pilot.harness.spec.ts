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
import { buildIcelandWindPilotShowcaseCase } from './build-wind-pilot-showcase';
import {
  buildWindPilotMetricsReport,
  renderWindPilotReportMarkdown,
} from './build-wind-pilot-report';
import { toCausalDecisionProductView } from '../../api/to-causal-decision-product-view';

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

  it('projects every case to Causal Decision product BFF view', () => {
    for (const c of cases) {
      const view = toCausalDecisionProductView({
        decision: c.decision,
        problemId: c.caseId,
      });
      expect(view.schema).toBe('tripnara.causal_decision_product@v1');
      expect(view.headline).toBeTruthy();
      expect(view.card.whatHappened).toBeTruthy();
      if (c.archetype !== 'WIND_NO_IMPACT') {
        expect(view.actByLabel).toMatch(/最晚需要在/);
      }
      expect(view.statusMessage ?? '').not.toContain('预测已验证');
    }
  });

  it('showcase: high-roof + gust≥18 makes 10min ETA buffer unstable', () => {
    const showcase = buildIcelandWindPilotShowcaseCase();
    expect(showcase.factSnapshot.highRoof).toBe(true);
    expect(showcase.factSnapshot.windMps).toBeGreaterThanOrEqual(18);
    expect(showcase.factSnapshot.appointmentSlackMinutes).toBe(10);

    const miss =
      showcase.decision.baselineOutcome.metrics?.iceland_miss_prob ??
      (showcase.decision.baselineOutcome.completionProbability != null
        ? 1 - showcase.decision.baselineOutcome.completionProbability
        : 0);
    expect(miss).toBeGreaterThan(0.2);
    expect(showcase.decision.interventions.length).toBeGreaterThan(0);
    expect(showcase.decision.temporalForecast.interventionDeadline).toBeTruthy();
    expect(
      showcase.decision.temporalForecast.interventionDeadline! <=
        showcase.irreparableAfterAt,
    ).toBe(true);

    const card = projectCausalDecisionCard(showcase.decision);
    expect(card.whyItMatters.length).toBeGreaterThanOrEqual(2);
    const product = toCausalDecisionProductView({
      decision: showcase.decision,
      problemId: showcase.caseId,
    });
    expect(product.headline).toMatch(/风|wind/i);
  });

  it('builds pilot metrics report for review board', () => {
    const withShowcase = [...cases, buildIcelandWindPilotShowcaseCase()];
    const report = buildWindPilotMetricsReport(
      withShowcase,
      '2026-07-30T00:00:00.000Z',
    );
    expect(report.schema).toBe('tripnara.iceland_wind_pilot_metrics@v1');
    expect(report.ok).toBe(true);
    expect(report.suite.caseCount).toBe(20);
    expect(report.cases.some((c) => c.caseId.includes('showcase'))).toBe(true);
    expect(report.cases.every((c) => c.productHeadline.length > 0)).toBe(true);

    const md = renderWindPilotReportMarkdown(report);
    expect(md).toContain('Pilot Metrics');
    expect(md).toContain('PASS');
    expect(md).toContain('showcase_high_roof_gust18_checkin');
  });
});
