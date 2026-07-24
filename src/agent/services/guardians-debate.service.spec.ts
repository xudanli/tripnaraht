// src/agent/services/guardians-debate.service.spec.ts
import {
  GuardiansDebateService,
  computeGateSnapshotKey,
  computeGuardiansDebateAwaitBudgetMs,
} from './guardians-debate.service';
import type { GateResult } from '../interfaces/trip-plan.interface';
import { LlmProvider } from '../../llm/dto/llm-request.dto';

describe('GuardiansDebateService', () => {
  const baseGate = (): GateResult => ({
    gate_result: 'ALLOW',
    violations: [],
    required_adjustments: [],
    confidence: 0.9,
  });

  it('hasFatalViolation is true for BLOCK', () => {
    const llm = { callLlmWithSchema: jest.fn(), getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    expect(svc.hasFatalViolation({ ...baseGate(), gate_result: 'BLOCK' })).toBe(true);
  });

  it('hasFatalViolation is true when native HARD violation (non VERIFY-synthetic)', () => {
    const llm = { callLlmWithSchema: jest.fn(), getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    expect(
      svc.hasFatalViolation({
        ...baseGate(),
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'x' }],
      }),
    ).toBe(true);
  });

  it('hasFatalViolation is false when only VERIFY-synthetic HARD', () => {
    const llm = { callLlmWithSchema: jest.fn(), getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    expect(
      svc.hasFatalViolation({
        ...baseGate(),
        violations: [{ type: 'SAFETY', severity: 'HARD', detail: '[VERIFY] ROUTE_INFEASIBLE: x', verify_synthetic: true }],
      }),
    ).toBe(false);
  });

  it('skips LLM on fatal gate and returns deterministic projection', async () => {
    const callLlmWithSchema = jest.fn();
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    const gate: GateResult = {
      ...baseGate(),
      gate_result: 'BLOCK',
      violations: [{ type: 'SAFETY', severity: 'HARD', detail: 'closed' }],
    };
    const out = await svc.mergeGuardianPersonaLlmIntoGate(gate, {});
    expect(callLlmWithSchema).not.toHaveBeenCalled();
    expect(out.guardian_results?.source).toBe('violation_projection_v1');
    expect(out.guardian_results?.is_simulated).toBe(true);
    expect(out.guardian_results?.abu?.verdict).toBe('REJECT');
  });

  it('calls LLM when non-fatal and merges validated JSON', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: {
          verdict: 'ALLOW',
          evidence: ['ok'],
          evidence_atoms: [{ text: 'a', violation_code: 'DEBATE:A', tag: 'safety' }],
        },
        drdre: {
          verdict: 'ALLOW',
          evidence: ['ok'],
          evidence_atoms: [{ text: 'd', violation_code: 'DEBATE:D', tag: 'pacing' }],
        },
        neptune: {
          verdict: 'ALLOW',
          evidence: ['ok'],
          evidence_atoms: [{ text: 'n', violation_code: 'DEBATE:N', tag: 'generic' }],
        },
        debate_summary_zh: '合议通过',
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');

    const out = await svc.mergeGuardianPersonaLlmIntoGate(baseGate(), {});
    expect(callLlmWithSchema).toHaveBeenCalled();
    expect(out.guardian_results?.source).toBe('llm_debate');
    expect(out.guardian_results?.debate_summary_zh).toBe('合议通过');
    expect(out.guardian_results?.debate_latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('REPLACE with weak debate_summary_zh logs warn but keeps llm_debate', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'REPLACE', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'replace_segment' }] },
        debate_summary_zh: '绕行OK',
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');
    const warnSpy = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

    const out = await svc.mergeGuardianPersonaLlmIntoGate(baseGate(), {});
    expect(out.guardian_results?.source).toBe('llm_debate');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/REPLACE debate_summary_zh too short.*no v1 fallback/),
    );
    warnSpy.mockRestore();
  });

  it('REPLACE with long summary but no risk hints logs warn', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'REPLACE', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'replace_segment' }] },
        debate_summary_zh:
          '合议认为本次替换方案整体可行且与门控结论一致建议用户按新行程执行并完成相关确认手续',
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');
    const warnSpy = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

    await svc.mergeGuardianPersonaLlmIntoGate(baseGate(), {});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/REPLACE debate_summary_zh missing common residual-risk hints/),
    );
    warnSpy.mockRestore();
  });

  it('discards LLM debate when REPLACE contradicts midnight-sun continuous drive intent', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'REPLACE', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'replace_segment' }] },
        debate_summary_zh:
          '采纳 Neptune REPLACE：缩至南岸精华，单日驾驶 1–1.5 小时；残余风险：侧风与碎石路需谨慎。',
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');

    const out = await svc.mergeGuardianPersonaLlmIntoGate(baseGate(), {
      tripContext: {
        request_id: 'r-marathon',
        origin: 'KEF',
        destination: 'Iceland',
        message: '想利用极昼，24小时不间断自驾环岛',
      },
    });
    expect(out.guardian_results?.source).toBe('llm_debate');
    expect(out.guardian_results?.is_simulated).toBe(true);
    expect(out.guardian_results?.debate_summary_zh).toMatch(/连续自驾|极昼/);
  });

  it('REPLACE with adequate residual-risk summary does not log REPLACE heuristic warn', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'REPLACE', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'replace_segment' }] },
        debate_summary_zh:
          'Neptune 已切换绕行；残余风险：发夹弯与黑冰可能升高负荷，预计增加驾驶时长，已由 Dr.Dre 核对节奏。',
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');
    const warnSpy = jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);

    await svc.mergeGuardianPersonaLlmIntoGate(baseGate(), {});
    const replaceWarns = warnSpy.mock.calls.filter(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('[GuardiansDebate] REPLACE'),
    );
    expect(replaceWarns).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('includes persona_closure_audit in LLM user payload when provided via opts', async () => {
    const audit = {
      stopReason: 'ABU_RECHECK_PASS' as const,
      totalAbuRechecks: 1,
      iters: [{ iter: 0, neptuneAction: 'REPLACE' as const, planFingerprintBefore: 'a', planFingerprintAfter: 'b', abuRecheck: 'ALLOW' as const, newHardViolations: [], stopReason: 'ABU_RECHECK_PASS' as const }],
    };
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['ok'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['ok'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'ALLOW', evidence: ['ok'], evidence_atoms: [{ text: 'n', tag: 'generic' }] },
        debate_summary_zh: '闭环已收敛，合议通过',
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');

    await svc.mergeGuardianPersonaLlmIntoGate(baseGate(), { personaClosureAudit: audit });
    const promptArg = callLlmWithSchema.mock.calls[0][1] as string;
    expect(promptArg).toContain('persona_closure_audit');
    expect(promptArg).toContain('ABU_RECHECK_PASS');
  });

  it('computeGuardiansDebateAwaitBudgetMs reserves wall clock for PLAN/VERIFY', () => {
    expect(computeGuardiansDebateAwaitBudgetMs(60_000)).toBe(18_000);
    expect(computeGuardiansDebateAwaitBudgetMs(43_000)).toBe(0);
  });

  it('consumeShadowOrMergeWithBudget falls back when LLM exceeds budget', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'ALLOW', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'generic' }] },
      },
    });
    const callLlmWithSchema = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve(json), 200);
        }),
    );
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');

    const gate = baseGate();
    svc.startShadowIfEligible('rid-budget', gate, {});
    const out = await svc.consumeShadowOrMergeWithBudget('rid-budget', gate, {}, 50);
    expect(out.debate_wait_timed_out).toBe(true);
    expect(out.gate.guardian_results?.source).toBe('violation_projection_v1');
  });

  it('computeGateSnapshotKey ignores guardian_results', () => {
    const base = baseGate();
    const withGr = {
      ...base,
      guardian_results: { source: 'violation_projection_v1', is_simulated: true },
    } as GateResult;
    expect(computeGateSnapshotKey(base)).toBe(computeGateSnapshotKey(withGr));
  });

  it('consumeShadowOrMerge awaits shadow when snapshot matches (single LLM call)', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'ALLOW', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'generic' }] },
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');

    const gate = baseGate();
    svc.startShadowIfEligible('rid-shadow', gate, {});
    const out = await svc.consumeShadowOrMerge('rid-shadow', gate, {});
    expect(callLlmWithSchema).toHaveBeenCalledTimes(1);
    expect(out.guardian_results?.source).toBe('llm_debate');
    expect(typeof out.guardian_results?.debate_shadow_wait_ms).toBe('number');
  });

  it('consumeShadowOrMerge discards stale shadow and runs merge again when snapshot mismatches', async () => {
    const json = JSON.stringify({
      guardian_results: {
        source: 'llm_debate',
        is_simulated: false,
        abu: { verdict: 'ALLOW', evidence: ['a'], evidence_atoms: [{ text: 'a', tag: 'safety' }] },
        drdre: { verdict: 'ALLOW', evidence: ['d'], evidence_atoms: [{ text: 'd', tag: 'pacing' }] },
        neptune: { verdict: 'ALLOW', evidence: ['n'], evidence_atoms: [{ text: 'n', tag: 'generic' }] },
      },
    });
    const callLlmWithSchema = jest.fn().mockResolvedValue(json);
    const llm = { callLlmWithSchema, getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    jest.spyOn(svc as any, 'loadSystemPrompt').mockReturnValue('# stub');

    svc.startShadowIfEligible('rid-m', baseGate(), {});
    const gateB: GateResult = {
      ...baseGate(),
      violations: [{ type: 'FATIGUE', severity: 'SOFT', detail: 'changed' }],
    };
    await svc.consumeShadowOrMerge('rid-m', gateB, {});
    expect(callLlmWithSchema).toHaveBeenCalledTimes(2);
  });

  it('parseGuardianDebateJson strips markdown fences', () => {
    const llm = { callLlmWithSchema: jest.fn(), getDefaultProvider: jest.fn().mockReturnValue(LlmProvider.DEEPSEEK) };
    const svc = new GuardiansDebateService(llm as any);
    const raw = '```json\n{"guardian_results":{}}\n```';
    expect(svc.parseGuardianDebateJson(raw)).toEqual({ guardian_results: {} });
  });
});
