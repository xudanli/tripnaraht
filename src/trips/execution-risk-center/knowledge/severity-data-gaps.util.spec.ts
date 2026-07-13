import { computeSeverityDataGaps } from './severity-data-gaps.util';
import { loadExecutionRiskKnowledgeFromPackage } from './execution-risk-knowledge.loader';

describe('computeSeverityDataGaps', () => {
  const snapshot = loadExecutionRiskKnowledgeFromPackage();
  const windRules = snapshot.severityRulesByCode.get('ENV-WIND-01') ?? [];

  it('reports WIND_SUSTAINED_MPS when no metrics and no official warning', () => {
    const gaps = computeSeverityDataGaps(windRules, {});
    expect(gaps).toContain('WIND_SUSTAINED_MPS');
  });

  it('returns empty gaps when official warning level is present', () => {
    const gaps = computeSeverityDataGaps(windRules, { OFFICIAL_WARNING_LEVEL: 'YELLOW' });
    expect(gaps).toHaveLength(0);
  });
});
