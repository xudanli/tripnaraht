/**
 * TaskFrame ↔ UnifiedIntent ↔ AgentTaskContract 对齐验收（不合并类型）。
 * 三个 Golden Case 必须同口径。
 */

import { compileAgentTaskContract } from '../harness/compile-agent-task-contract.util';
import { resolveUnifiedIntent } from '../intent/unified-intent.resolver';
import {
  compileSystem1TaskFrameFromUpstream,
  projectSystem1UpstreamAlignment,
  resolveSystem1RuntimeFamily,
} from './index';

const TRIP = '00000000-0000-4000-8000-0000000000aa';

function align(message: string) {
  const contract = compileAgentTaskContract({
    message,
    turnId: 'align',
    tripId: TRIP,
  });
  const unifiedIntentDecision = resolveUnifiedIntent({ message, tripId: TRIP });
  const frame = compileSystem1TaskFrameFromUpstream({
    message,
    tripId: TRIP,
    contract,
    unifiedIntentDecision,
  });
  return { contract, unifiedIntentDecision, frame };
}

describe('System1 upstream alignment (TaskFrame ↔ Intent ↔ Contract)', () => {
  it('Case1 F208：三模型同为安全评估 / LIVE_EXECUTION', () => {
    const { contract, unifiedIntentDecision, frame } = align('明天还能走 F208 吗？');
    expect(frame.questionType).toBe('FEASIBILITY');
    expect(frame.requestedAction).toBe('ASSESS');
    expect(frame.intent).toBe('ASSESS_IMPACT');
    expect(contract.taskType).toBe('LIVE_EXECUTION');
    expect(contract.allowFullPlanning).toBe(false);
    expect(unifiedIntentDecision.semanticIntent).toBe('ASSESS_IMPACT');
    expect(unifiedIntentDecision.topic).toBe('ROAD');
    expect(unifiedIntentDecision.mutationPolicy).toBe('READ_ONLY');
    expect(resolveSystem1RuntimeFamily(frame, null, '明天还能走 F208 吗？')).toBe(
      'LIVE_FEASIBILITY',
    );
    expect(frame.sourceSignals.intentTopic).toBe('ROAD');
    expect(frame.sourceSignals.contractAuthority).toBeTruthy();
    const snap = projectSystem1UpstreamAlignment({
      frame,
      contract,
      unifiedIntentDecision,
    });
    expect(snap.contract).toEqual(
      expect.objectContaining({ task_type: 'LIVE_EXECUTION' }),
    );
  });

  it('Case2 住宿缺口：TRIP_QUERY + CONSULT/LODGING + STATE_QUERY，禁 Full Planning', () => {
    const { contract, unifiedIntentDecision, frame } = align('哪一天没有住宿？');
    expect(frame.questionType).toBe('STATE_QUERY');
    expect(frame.requestedAction).toBe('READ');
    expect(frame.target?.type).toBe('LODGING');
    expect(contract.taskType).toBe('TRIP_QUERY');
    expect(contract.allowFullPlanning).toBe(false);
    expect(unifiedIntentDecision.semanticIntent).toBe('CONSULT');
    expect(unifiedIntentDecision.topic).toBe('LODGING');
    expect(unifiedIntentDecision.mutationPolicy).toBe('READ_ONLY');
    expect(resolveSystem1RuntimeFamily(frame, 'TRIP_QUERY_LODGING')).toBe(
      'TRIP_QUERY_LODGING',
    );
  });

  it('Case3 软推荐：RECOMMEND + CONSULT，不得升 LIVE / WRITE / Full Planning', () => {
    const message = '冰河湖和钻石沙滩哪个更值得去？';
    const { contract, unifiedIntentDecision, frame } = align(message);
    expect(frame.questionType).toBe('RECOMMEND');
    expect(frame.requestedAction).toBe('RECOMMEND');
    expect(frame.riskLevel).toBe('LOW');
    expect(contract.taskType).not.toBe('LIVE_EXECUTION');
    expect(contract.taskType).not.toBe('ITINERARY_ADJUST');
    expect(contract.allowFullPlanning).toBe(false);
    expect(unifiedIntentDecision.semanticIntent).toBe('CONSULT');
    expect(unifiedIntentDecision.mutationPolicy).toBe('READ_ONLY');
    expect(['ACTIVITY', 'GENERAL']).toContain(unifiedIntentDecision.topic);
    expect(resolveSystem1RuntimeFamily(frame, null, message)).toBe('KNOWLEDGE_QA');
    expect(resolveSystem1RuntimeFamily(frame, null, message)).not.toBe(
      'LIVE_FEASIBILITY',
    );
  });
});
