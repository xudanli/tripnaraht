import { DEFAULT_AUTOMATION_EXPORT } from '../../trip-constraint-solver/utils/travel-decision-contract.defaults';
import { AUTOMATION_ACTION_GROUP_LABELS } from '../../../decision-runtime/authorization/automation-action.catalog';
import { projectAutomationCatalogSummary } from './automation-catalog-summary.projection.util';

describe('projectAutomationCatalogSummary', () => {
  it('always returns all six permission groups for BFF empty-state handoff', () => {
    const catalog = projectAutomationCatalogSummary(DEFAULT_AUTOMATION_EXPORT);

    expect(catalog.schemaId).toBe('tripnara.automation_authorization_summary@v1');
    expect(catalog.groups).toHaveLength(6);
    expect(catalog.groups.map((g) => g.group)).toEqual(
      Object.keys(AUTOMATION_ACTION_GROUP_LABELS),
    );
    for (const group of catalog.groups) {
      expect(group.label).toBeTruthy();
      expect(group.actions.length).toBeGreaterThan(0);
      expect(group.autoCount + group.askCount + group.denyCount).toBe(group.actions.length);
    }
  });
});
