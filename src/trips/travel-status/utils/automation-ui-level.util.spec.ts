import { DEFAULT_AUTOMATION_EXPORT } from '../../trip-constraint-solver/utils/travel-decision-contract.defaults';
import {
  aggregateAutomationTierCounts,
  projectAutomationCatalogSummary,
} from './automation-catalog-summary.projection.util';
import { toAutomationUiLevel } from './automation-ui-level.util';

describe('aggregateAutomationTierCounts', () => {
  it('sums tier counts across all catalog groups', () => {
    const catalog = projectAutomationCatalogSummary(DEFAULT_AUTOMATION_EXPORT);
    const counts = aggregateAutomationTierCounts(catalog);

    const manual = catalog.groups.reduce(
      (acc, g) => ({
        auto: acc.auto + g.autoCount,
        ask: acc.ask + g.askCount,
        deny: acc.deny + g.denyCount,
      }),
      { auto: 0, ask: 0, deny: 0 },
    );

    expect(counts).toEqual(manual);
    expect(counts.auto + counts.ask + counts.deny).toBeGreaterThan(0);
  });
});

describe('toAutomationUiLevel', () => {
  it('maps INFORM_ONLY to merged L0_L1', () => {
    expect(toAutomationUiLevel('INFORM_ONLY')).toBe('L0_L1');
  });

  it('maps backend levels to four UI tiers', () => {
    expect(toAutomationUiLevel('SUGGEST')).toBe('L2');
    expect(toAutomationUiLevel('AUTO_REPAIR_LOW_RISK')).toBe('L3');
    expect(toAutomationUiLevel('AUTO_EXECUTE_CONDITIONAL')).toBe('L4');
  });
});
