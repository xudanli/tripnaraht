import {
  constraintIdFromTemplate,
  getConstraintTemplate,
  isLegacyPatchOnlyTemplate,
  listConstraintTemplateIds,
  mergeTemplateValue,
  projectCatalogTemplateForBff,
} from './constraint-template-registry.util';
import type { StoredUnifiedConstraint } from '../types/trip-constraint.types';

describe('constraint-template-registry.util', () => {
  it('lists catalog template ids including earliest_departure', () => {
    const ids = listConstraintTemplateIds();
    expect(ids).toContain('earliest_departure');
    expect(ids).toContain('no_unverified_route');
    expect(ids.length).toBeGreaterThanOrEqual(16);
  });

  it('stable constraint id from template', () => {
    expect(constraintIdFromTemplate('earliest_departure')).toBe('c_tpl_earliest_departure');
  });

  it('mergeTemplateValue applies defaults', () => {
    const def = getConstraintTemplate('earliest_departure')!;
    expect(mergeTemplateValue(def, { time: '07:30' }).time).toBe('07:30');
    expect(mergeTemplateValue(def, {}).time).toBe('08:00');
  });

  it('legacy templates are patch-only', () => {
    expect(isLegacyPatchOnlyTemplate('no_night_drive')).toBe(true);
    expect(isLegacyPatchOnlyTemplate('earliest_departure')).toBe(false);
  });

  it('projectCatalogTemplateForBff builds judgmentRule', () => {
    const def = getConstraintTemplate('max_daily_activity')!;
    const projected = projectCatalogTemplateForBff(
      {
        id: 'c_tpl_max_daily_activity',
        tripId: 't1',
        name: def.defaultName,
        category: def.category,
        type: 'HARD',
        status: 'ACTIVE',
        scope: def.scope,
        operator: def.operator,
        value: { maxHours: 8 },
        allowRelaxation: true,
        locked: false,
        source: { type: 'USER', templateId: def.templateId },
        visibility: 'TEAM',
        createdBy: 'u1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      def,
    );
    expect(projected.judgmentRule).toContain('8 小时');
    expect(projected.value.judgmentRule).toContain('8 小时');
  });
});

describe('create template resolution', () => {
  it('builds StoredUnifiedConstraint shape from template', () => {
    const def = getConstraintTemplate('earliest_departure')!;
    const stored: StoredUnifiedConstraint = {
      id: constraintIdFromTemplate(def.templateId),
      name: '最早出发时间',
      category: def.category,
      type: def.type,
      status: 'ACTIVE',
      scope: def.scope,
      operator: def.operator,
      value: mergeTemplateValue(def, { templateId: def.templateId }),
      allowRelaxation: def.allowRelaxation,
      locked: false,
      source: { type: 'USER', templateId: def.templateId },
      visibility: 'TEAM',
      createdBy: 'user-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(stored.id).toBe('c_tpl_earliest_departure');
    expect(stored.source.templateId).toBe('earliest_departure');
  });
});
