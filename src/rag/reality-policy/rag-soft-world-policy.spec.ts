import { resolveRagSoftWorldPolicy } from './rag-soft-world-policy';

describe('resolveRagSoftWorldPolicy', () => {
  const prevEnforce = process.env.RAG_REALITY_POLICY_ENFORCE;
  const prevRe = process.env.REALITY_ENFORCEMENT;

  afterEach(() => {
    process.env.RAG_REALITY_POLICY_ENFORCE = prevEnforce;
    process.env.REALITY_ENFORCEMENT = prevRe;
  });

  it('missing context + enforcement off → ALLOW via planning tick', () => {
    process.env.RAG_REALITY_POLICY_ENFORCE = '0';
    process.env.REALITY_ENFORCEMENT = '0';
    const { scope, policy } = resolveRagSoftWorldPolicy(undefined);
    expect(scope).toBe('full');
    expect(policy.verdict).toBe('ALLOW');
  });

  it('missing context + enforcement on → blocked', () => {
    process.env.RAG_REALITY_POLICY_ENFORCE = '1';
    const { scope, policy } = resolveRagSoftWorldPolicy(undefined);
    expect(scope).toBe('blocked');
    expect(policy.codes).toContain('RAG_CONTEXT_REQUIRED');
  });
});
