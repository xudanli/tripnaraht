import Ajv from 'ajv';
import schema from '../schemas/constraint-template-registry.schema.json';
import {
  exportConstraintTemplateCatalog,
  listConstraintTemplateIds,
  listSoftConstraintTemplateIds,
} from './constraint-template-registry.util';

describe('constraint-template-registry export', () => {
  it('exportConstraintTemplateCatalog validates against JSON Schema', () => {
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const catalog = exportConstraintTemplateCatalog();
    const ok = validate(catalog);
    if (!ok) {
      throw new Error(JSON.stringify(validate.errors, null, 2));
    }
    expect(catalog.templates.length).toBe(listConstraintTemplateIds().length);
  });

  it('SOFT templates map to soft_prefer section', () => {
    const catalog = exportConstraintTemplateCatalog();
    const softIds = new Set(listSoftConstraintTemplateIds());
    for (const t of catalog.templates) {
      if (softIds.has(t.templateId)) {
        expect(t.sectionKey).toBe('soft_prefer');
        expect(t.type).toBe('SOFT');
        expect(t.constraintId).toBe(`c_tpl_${t.templateId}`);
      }
    }
  });

  it('minimize_hotel_changes has defaultPriority 8 and intensity 85', () => {
    const entry = exportConstraintTemplateCatalog().templates.find(
      (t) => t.templateId === 'minimize_hotel_changes',
    );
    expect(entry?.defaultPriority).toBe(8);
    expect(entry?.defaultIntensity).toBe(85);
    expect(entry?.solverRuleKind).toBe('lodging_continuity');
  });
});
