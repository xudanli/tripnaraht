/**
 * Unified Intent P1 — golden 规则准确率 + LLM 解析 / 触发条件。
 */

import { resolveUnifiedIntent } from './unified-intent.resolver';
import { UNIFIED_INTENT_GOLDEN_CASES } from './unified-intent.golden';
import {
  buildUnifiedIntentLlmPrompt,
  parseUnifiedIntentLlmOutput,
  runUnifiedIntentLlmShadow,
  shouldDisambiguateUnifiedIntentWithLlm,
  UNIFIED_INTENT_LLM_SCHEMA,
} from './unified-intent.llm-classifier';
import { extractUnifiedIntentSignals } from './unified-intent-signals.util';

describe('UnifiedIntent P1 golden (rule layer)', () => {
  it.each(UNIFIED_INTENT_GOLDEN_CASES)(
    '$id → $expectedIntent',
    (c) => {
      const d = resolveUnifiedIntent({
        message: c.utterance,
        tripId: c.tripId ?? 't1',
      });
      expect(d.semanticIntent).toBe(c.expectedIntent);
      if (c.expectedRouteClass) {
        expect(d.routeClass).toBe(c.expectedRouteClass);
      }
      if (c.id === 'assess_no_mutation') {
        expect(d.mutationPolicy).toBe('READ_ONLY');
      }
    },
  );
});

describe('UnifiedIntent P1 LLM classifier (offline)', () => {
  it('parseUnifiedIntentLlmOutput 接受合法 JSON', () => {
    const raw = JSON.stringify({
      schema: UNIFIED_INTENT_LLM_SCHEMA,
      semanticIntent: 'LOCAL_EDIT',
      requestedOperation: 'CREATE_DRAFT',
      topic: 'MEAL',
      scope: 'DAY',
      dayIndex: 3,
      mutationPolicy: 'DRAFT_ONLY',
      confidence: 0.97,
      rationale: '安排午餐',
    });
    const out = parseUnifiedIntentLlmOutput(raw);
    expect(out.semanticIntent).toBe('LOCAL_EDIT');
    expect(out.dayIndex).toBe(3);
  });

  it('parse 拒绝非法 semanticIntent', () => {
    expect(() =>
      parseUnifiedIntentLlmOutput(
        JSON.stringify({
          schema: UNIFIED_INTENT_LLM_SCHEMA,
          semanticIntent: 'FOO',
          requestedOperation: 'ANSWER',
          topic: 'GENERAL',
          scope: 'TRIP',
          mutationPolicy: 'READ_ONLY',
          confidence: 0.5,
        }),
      ),
    ).toThrow(/semanticIntent/);
  });

  it('复合句应触发 LLM 消歧', () => {
    const msg = 'Day3 安排午餐，顺便看看天气会不会影响下午';
    const decision = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    const signals = extractUnifiedIntentSignals({ message: msg, tripId: 't1' });
    expect(
      shouldDisambiguateUnifiedIntentWithLlm({ signals, decision }),
    ).toBe(true);
  });

  it('高置信纯 CONSULT 可不跑 LLM', () => {
    const msg = '我的总体行程怎么样？';
    const decision = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    const signals = extractUnifiedIntentSignals({ message: msg, tripId: 't1' });
    expect(decision.semanticIntent).toBe('CONSULT');
    expect(decision.confidence).toBeGreaterThanOrEqual(0.75);
    expect(
      shouldDisambiguateUnifiedIntentWithLlm({ signals, decision }),
    ).toBe(false);
  });

  it('runUnifiedIntentLlmShadow：注入 mock LLM，记录 disagreement', async () => {
    const msg = 'Day3行程我要安排午餐';
    const ruleDecision = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    const shadow = await runUnifiedIntentLlmShadow({
      message: msg,
      tripId: 't1',
      ruleDecision,
      force: true,
      callLlm: async (prompt) => {
        expect(prompt).toContain('LOCAL_EDIT');
        expect(buildUnifiedIntentLlmPrompt).toBeDefined();
        return JSON.stringify({
          schema: UNIFIED_INTENT_LLM_SCHEMA,
          semanticIntent: 'CONSULT',
          requestedOperation: 'ANSWER',
          topic: 'MEAL',
          scope: 'DAY',
          dayIndex: 3,
          mutationPolicy: 'READ_ONLY',
          confidence: 0.4,
          rationale: 'mock wrong consult',
        });
      },
    });
    expect(shadow.ran).toBe(true);
    expect(shadow.agree).toBe(false);
    expect(shadow.disagreement?.some((d) => d.includes('semanticIntent'))).toBe(true);
    expect(shadow.llm?.semanticIntent).toBe('CONSULT');
    expect(shadow.ruleIntent).toBe('LOCAL_EDIT');
  });

  it('runUnifiedIntentLlmShadow：规则自信时可 skip', async () => {
    const msg = '我的总体行程怎么样？';
    const ruleDecision = resolveUnifiedIntent({ message: msg, tripId: 't1' });
    const shadow = await runUnifiedIntentLlmShadow({
      message: msg,
      tripId: 't1',
      ruleDecision,
      callLlm: async () => {
        throw new Error('should not call');
      },
    });
    expect(shadow.ran).toBe(false);
    expect(shadow.reasonSkipped).toBe('rules_confident_no_conflict');
  });
});
