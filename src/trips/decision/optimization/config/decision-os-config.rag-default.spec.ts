import { DecisionOSConfigService } from './decision-os-config.service';

describe('DecisionOSConfigService ragEvidence defaults', () => {
  const prev = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = prev;
    delete process.env.DECISION_OS_RAG_EVIDENCE_ENABLED;
    delete process.env.KERNEL_CGUS_RAG_EVIDENCE;
  });

  it('enables ragEvidence on staging by default', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.DECISION_OS_RAG_EVIDENCE_ENABLED;
    const svc = new DecisionOSConfigService();
    expect(svc.get('ragEvidence').enabled).toBe(true);
  });

  it('keeps ragEvidence off on development unless env set', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DECISION_OS_RAG_EVIDENCE_ENABLED;
    const svc = new DecisionOSConfigService();
    expect(svc.get('ragEvidence').enabled).toBe(false);
  });
});
