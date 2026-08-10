import { CHINA_COMPLIANCE_KNOWLEDGE_PACK } from './china-compliance-knowledge.pack';
import {
  complianceCategoryDescriptionZh,
  complianceCategoryTipZh,
  resolveCompliancePack,
} from './compliance-knowledge.resolve';
import { GENERIC_SELF_DRIVE_COMPLIANCE_KNOWLEDGE_PACK } from './generic-self-drive-compliance-knowledge.pack';
import { ICELAND_COMPLIANCE_KNOWLEDGE_PACK } from './iceland-compliance-knowledge.pack';

describe('resolveCompliancePack', () => {
  it('returns Iceland pack only for IS', () => {
    expect(resolveCompliancePack('IS')).toBe(ICELAND_COMPLIANCE_KNOWLEDGE_PACK);
    expect(resolveCompliancePack('IS').some((i) => i.id === 'no_offroad')).toBe(
      true,
    );
  });

  it('returns China pack for CN and never Iceland titles', () => {
    const pack = resolveCompliancePack('CN');
    expect(pack).toBe(CHINA_COMPLIANCE_KNOWLEDGE_PACK);
    expect(pack.some((i) => i.id === 'city_driving_limit')).toBe(true);
    expect(pack.some((i) => i.id === 'etc_expressway')).toBe(true);
    expect(pack.some((i) => i.titleZh.includes('冰岛'))).toBe(false);
    expect(pack.some((i) => i.id === 'no_offroad')).toBe(false);
    const checkpoint = pack.find((i) => i.id === 'checkpoint_documents');
    expect(checkpoint?.contentUrl).toMatch(
      /pack:\/\/country-packs\/CN\/compliance\/checkpoint-documents/,
    );
  });

  it('does not fall back to Iceland for unknown or empty country', () => {
    expect(resolveCompliancePack('NZ')).toBe(
      GENERIC_SELF_DRIVE_COMPLIANCE_KNOWLEDGE_PACK,
    );
    expect(resolveCompliancePack(null)).toBe(
      GENERIC_SELF_DRIVE_COMPLIANCE_KNOWLEDGE_PACK,
    );
    expect(resolveCompliancePack('NZ').some((i) => i.id === 'no_offroad')).toBe(
      false,
    );
  });

  it('localizes compliance category copy', () => {
    expect(complianceCategoryDescriptionZh('CN')).toMatch(/限行|ETC|高原/);
    expect(complianceCategoryTipZh('CN').textZh).toMatch(/限行|ETC|高反/);
    expect(complianceCategoryTipZh('IS').textZh).toMatch(/越野/);
  });
});
