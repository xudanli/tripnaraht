import { resolveRagSoftWorldPolicy } from '../../rag/reality-policy/rag-soft-world-policy';
import { buildConsultationDecisionContextV0 } from './build-consultation-decision-context-v0';
import { DECISION_CONTEXT_SCHEMA_V0 } from './decision-context.types';

describe('buildConsultationDecisionContextV0', () => {
  const prevEnforce = process.env.RAG_REALITY_POLICY_ENFORCE;
  const prevRe = process.env.REALITY_ENFORCEMENT;

  afterEach(() => {
    if (prevEnforce === undefined) delete process.env.RAG_REALITY_POLICY_ENFORCE;
    else process.env.RAG_REALITY_POLICY_ENFORCE = prevEnforce;
    if (prevRe === undefined) delete process.env.REALITY_ENFORCEMENT;
    else process.env.REALITY_ENFORCEMENT = prevRe;
  });

  it('builds bound_v0 context for CN consultation', () => {
    const ctx = buildConsultationDecisionContextV0({
      region: 'cn',
      runId: 'g318-rag-http',
      startYmd: '2026-07-01',
      endYmd: '2026-07-14',
    });
    expect(ctx.schema).toBe(DECISION_CONTEXT_SCHEMA_V0);
    expect(ctx.enforcement).toBe('bound_v0');
    expect(ctx.reality.domain.region).toBe('cn');
    expect(ctx.reality.validity.status).toBe('VALID');
    expect(ctx.snapshot_id).toBe(ctx.reality.snapshot_id);
  });

  it('passes RAG reality gate when enforcement is on', () => {
    process.env.RAG_REALITY_POLICY_ENFORCE = '1';
    const ctx = buildConsultationDecisionContextV0({ region: 'cn' });
    const { scope, policy } = resolveRagSoftWorldPolicy(ctx);
    expect(scope).toBe('full');
    expect(policy.verdict).toBe('ALLOW');
    expect(policy.codes).not.toContain('RAG_CONTEXT_REQUIRED');
  });

  it('still blocks when enforcement on and context missing', () => {
    process.env.RAG_REALITY_POLICY_ENFORCE = '1';
    const { scope, policy } = resolveRagSoftWorldPolicy(undefined);
    expect(scope).toBe('blocked');
    expect(policy.codes).toContain('RAG_CONTEXT_REQUIRED');
  });
});
