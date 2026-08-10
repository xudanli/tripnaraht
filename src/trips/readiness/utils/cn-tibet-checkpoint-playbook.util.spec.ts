import {
  __resetCnTibetCheckpointPlaybookCacheForTests,
  buildCnTibetCheckpointPlaybookMeta,
  getCnTibetCheckpointPlaybook,
} from './cn-tibet-checkpoint-playbook.util';

describe('cn-tibet-checkpoint-playbook.util', () => {
  beforeEach(() => {
    __resetCnTibetCheckpointPlaybookCacheForTests();
  });

  it('loads pilot playbook with hard disclaimer', () => {
    const p = getCnTibetCheckpointPlaybook();
    expect(p.id).toBe('cn.playbook.tibet_checkpoint_pilot');
    expect(p.version).toMatch(/^1\./);
    expect(p.disclaimer).toMatch(/不代办|非法律/);
    expect(p.advisoriesCN.length).toBeGreaterThan(0);
    expect(p.relatedComplianceIds).toContain('checkpoint_documents');
  });

  it('builds meta for drivingContext / consult', () => {
    const meta = buildCnTibetCheckpointPlaybookMeta();
    expect(meta.playbook_id).toBe('cn.playbook.tibet_checkpoint_pilot');
    expect(String(meta.summary_cn)).toMatch(/检查站|证件/);
  });
});
