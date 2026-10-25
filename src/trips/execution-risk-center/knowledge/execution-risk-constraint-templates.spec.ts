import { DEFAULT_RISK_CONSTRAINT_BINDINGS } from './execution-risk-constraint-binding.defaults';
import {
  assertSeedTemplatesCoveredByCatalog,
  EXECUTION_RISK_CONSTRAINT_TEMPLATES,
  getConstraintTemplateDef,
  listConstraintTemplateDefs,
} from './execution-risk-constraint-templates';

describe('execution-risk-constraint-templates', () => {
  it('catalog items have id + labelZh and are unique', () => {
    expect(EXECUTION_RISK_CONSTRAINT_TEMPLATES.length).toBeGreaterThan(0);
    const ids = new Set<string>();
    for (const t of EXECUTION_RISK_CONSTRAINT_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.labelZh).toBeTruthy();
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
  });

  it('seed-defaults constraintTemplateIds ⊆ catalog', () => {
    expect(assertSeedTemplatesCoveredByCatalog()).toEqual([]);
    for (const seed of DEFAULT_RISK_CONSTRAINT_BINDINGS) {
      expect(getConstraintTemplateDef(seed.constraintTemplateId)?.id).toBe(
        seed.constraintTemplateId,
      );
    }
  });

  it('default list is ENABLED-only; status=all returns full set', () => {
    const enabled = listConstraintTemplateDefs();
    expect(enabled.every((t) => t.status === 'ENABLED')).toBe(true);
    const all = listConstraintTemplateDefs({ status: null });
    expect(all.length).toBe(EXECUTION_RISK_CONSTRAINT_TEMPLATES.length);
  });

  it('q filters by id / labelZh', () => {
    const hit = listConstraintTemplateDefs({ q: '风力' });
    expect(hit.some((t) => t.id === 'c_official_is_wind_safety')).toBe(true);
  });
});
