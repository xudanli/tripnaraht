import { aggregateExecutabilityStatus } from './verdict.mapper';
import { mapFeasibilityIssueToRuleResult, mapFeasibilityIssuesToAssessment } from './feasibility-to-executability.mapper';
import { resolveSdrRuleId, resetSdrRuleMappingCache } from './sdr-rule-id.mapper';

describe('sdr-rule-id.mapper', () => {
  beforeEach(() => resetSdrRuleMappingCache());

  it('maps pack ruleId to SDR-*', () => {
    expect(resolveSdrRuleId({ packRuleId: 'IS_ROAD_CLOSED_BLOCK' })).toBe('SDR-002');
    expect(resolveSdrRuleId({ packRuleId: 'IS_DAILY_LOAD_EXCESSIVE_BLOCK' })).toBe('SDR-101');
  });

  it('maps issueKind to SDR-*', () => {
    expect(resolveSdrRuleId({ issueKind: 'daily_drive' })).toBe('SDR-101');
    expect(resolveSdrRuleId({ issueKind: 'no_night_drive' })).toBe('SDR-202');
    expect(resolveSdrRuleId({ issueKind: 'rental_contract' })).toBe('SDR-003');
  });
});

describe('feasibility-to-executability.mapper', () => {
  it('maps must_handle blocker to NOT_EXECUTABLE', () => {
    const assessment = mapFeasibilityIssuesToAssessment({
      tripId: 'trip_1',
      issues: [
        {
          id: 'issue_1',
          priority: 'must_handle',
          category: 'transport',
          title: 'Road closed',
          message: 'F-road closed',
          affectedDays: [2],
          severity: 'high',
          issueKind: 'road_class',
          proofs: [{ ruleId: 'IS_ROAD_CLOSED_BLOCK', entity: 'road', constraint: 'closed', currentFact: 'CLOSED', evidenceSource: 'ROAD_IS', evidenceType: 'road_status', conclusion: 'blocked' }],
        },
      ],
      packId: 'destination.is',
      packVersion: '1.0.0',
      countryCode: 'IS',
    });

    expect(assessment.ruleResults[0]?.ruleId).toBe('SDR-002');
    expect(assessment.status).toBe('NOT_EXECUTABLE');
  });

  it('maps suggest_adjust to REQUIRES_REPAIR', () => {
    const assessment = mapFeasibilityIssuesToAssessment({
      tripId: 'trip_1',
      issues: [
        {
          id: 'issue_2',
          priority: 'suggest_adjust',
          category: 'schedule',
          title: 'Long drive',
          message: 'Daily drive excessive',
          affectedDays: [1],
          severity: 'medium',
          issueKind: 'daily_drive',
        },
      ],
      packId: 'destination.is',
      packVersion: '1.0.0',
      countryCode: 'IS',
    });

    expect(assessment.ruleResults[0]?.ruleId).toBe('SDR-101');
    expect(assessment.status).toBe('REQUIRES_REPAIR');
  });

  it('maps single issue via mapFeasibilityIssueToRuleResult', () => {
    const rule = mapFeasibilityIssueToRuleResult(
      {
        id: 'issue_3',
        priority: 'pending_confirm',
        category: 'booking',
        title: 'Confirm hotel',
        message: 'Late arrival',
        affectedDays: [3],
        severity: 'medium',
        issueKind: 'inter_day_travel',
      },
      'IS',
    );

    expect(rule.ruleId).toBe('SDR-203');
    expect(rule.outcome).toBe('NEED_CONFIRM');
  });

  it('aggregates empty issues to EXECUTABLE', () => {
    const assessment = mapFeasibilityIssuesToAssessment({
      tripId: 'trip_1',
      issues: [],
      packId: 'destination.is',
      packVersion: '1.0.0',
    });
    expect(assessment.status).toBe('EXECUTABLE');
    expect(aggregateExecutabilityStatus([])).toBe('EXECUTABLE');
  });
});
