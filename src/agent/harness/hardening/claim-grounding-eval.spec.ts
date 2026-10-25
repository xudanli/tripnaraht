/**
 * Claim Grounding ↔ Harness Eval 验收（三个 Golden Case）。
 */

import {
  buildAgentTurnTrace,
  projectAgentTurnTraceForObservability,
} from './agent-turn-trace.util';
import { evaluateClaimGroundingForHarness } from './claim-grounding-eval.util';
import { compileAgentTaskContract } from '../compile-agent-task-contract.util';
import {
  buildKnowledgeQaClaims,
  buildLiveFeasibilityClaims,
  projectSystem1TurnTrace,
  runSystem1DecisionRuntime,
  type System1Evidence,
} from '../../system1-runtime';

const TRIP = '00000000-0000-4000-8000-0000000000aa';

function ev(
  key: string,
  status: System1Evidence['status'],
  value: unknown,
  id = key,
): System1Evidence {
  return {
    evidenceId: id,
    key,
    sourceType: key.startsWith('trip.')
      ? 'TRIP_STATE'
      : key.startsWith('knowledge.')
        ? 'KNOWLEDGE'
        : 'WORLD_STATE',
    value,
    status,
  };
}

describe('Claim Grounding Harness Eval', () => {
  it('Case1 F208：路况 VERIFIED 的可行性 Claim 通过 Eval，并进入 AgentTurnTrace', () => {
    const message = '明天还能走 F208 吗？';
    const evidence = [
      ev('route.status', 'VERIFIED', 'F208 CLOSED', 'road'),
      ev('weather.wind', 'VERIFIED', '阵风偏大', 'wx'),
      ev('vehicle.profile', 'VERIFIED', '两驱', 'veh'),
      ev('trip.current_location', 'VERIFIED', '雷克雅未克', 'loc'),
    ];
    const trace = runSystem1DecisionRuntime({
      message,
      tripId: TRIP,
      family: 'LIVE_FEASIBILITY',
      evidence,
      claims: buildLiveFeasibilityClaims({
        conclusionZh: '明天不建议走 F208',
        verdict: 'NO',
        hasWeather: true,
      }),
      draftAnswer: '明天不建议走 F208',
    });
    const evalResult = evaluateClaimGroundingForHarness(trace);
    expect(evalResult.passed).toBe(true);
    expect(evalResult.strongWithoutVerified).toBe(false);
    expect(evalResult.groundedCount).toBeGreaterThan(0);

    const projected = projectSystem1TurnTrace(trace);
    expect((projected.claim_grounding_eval as any).passed).toBe(true);
    expect((projected.claim_grounding_eval as any).schema_id).toBe(
      'tripnara.claim_grounding_eval@v1',
    );

    const contract = compileAgentTaskContract({
      message,
      turnId: 'cg-case1',
      tripId: TRIP,
    });
    const turn = buildAgentTurnTrace({
      contract,
      runtimeSelected: 'LIVE_EXECUTION',
      claimGrounding: evalResult,
      resultStatus: 'ANSWERED',
      conclusionStrength: 'STRONG',
      answerPreviewZh: trace.finalAnswer,
    });
    const obs = projectAgentTurnTraceForObservability(turn);
    expect((obs.claim_grounding as any).passed).toBe(true);
    expect(contract.taskType).toBe('LIVE_EXECUTION');
  });

  it('Case2 住宿：STATE_FACT STRONG + VERIFIED 日程通过 Eval', () => {
    const trace = runSystem1DecisionRuntime({
      message: '哪一天没有住宿？',
      tripId: TRIP,
      family: 'TRIP_QUERY_LODGING',
      evidence: [
        ev('trip.day_list', 'VERIFIED', { dayCount: 7 }),
        ev('trip.accommodation_anchors', 'VERIFIED', { missingDayNumbers: [3] }),
      ],
      claims: [
        {
          claimId: 'c_state',
          type: 'STATE_FACT',
          text: '第 3 天没有住宿。',
          evidenceKeys: ['trip.day_list', 'trip.accommodation_anchors'],
          strength: 'STRONG',
        },
      ],
      draftAnswer: '第 3 天没有住宿。',
    });
    const evalResult = evaluateClaimGroundingForHarness(trace);
    expect(evalResult.passed).toBe(true);
    expect(evalResult.candidateClaimTypes).toEqual(['STATE_FACT']);
  });

  it('Case3 软推荐：仅 knowledge 命中通过；不得被安全合同误杀', () => {
    const message = '冰河湖和钻石沙滩哪个更值得去？';
    const evidence = [
      ev(
        'knowledge.hit',
        'VERIFIED',
        '两者相邻；时间紧优先冰河湖',
        'k1',
      ),
    ];
    const trace = runSystem1DecisionRuntime({
      message,
      tripId: TRIP,
      family: 'KNOWLEDGE_QA',
      evidence,
      claims: buildKnowledgeQaClaims({
        text: '时间紧优先冰河湖',
        asRecommendation: true,
      }),
      draftAnswer: '时间紧优先冰河湖',
    });
    const evalResult = evaluateClaimGroundingForHarness(trace);
    expect(evalResult.passed).toBe(true);
    expect(evalResult.softRecommendBlockedBySafety).toBe(false);
    expect(evalResult.candidateClaimTypes).toEqual(['RECOMMENDATION']);
    expect(evalResult.violations).toEqual([]);
  });

  it('强 Claim 无 VERIFIED → Eval 失败，可供 Hardening 计无证据强结论', () => {
    const trace = runSystem1DecisionRuntime({
      message: '明天还能走 F208 吗？',
      tripId: TRIP,
      family: 'LIVE_FEASIBILITY',
      evidence: [
        ev('route.status', 'ASSUMED', '大概能开'),
        ev('weather.wind', 'ASSUMED', '可能有风'),
        ev('vehicle.profile', 'ASSUMED', '两驱'),
        ev('trip.current_location', 'ASSUMED', '未知'),
      ],
      claims: [
        {
          claimId: 'c_bad',
          type: 'FEASIBILITY',
          text: '一定可以走',
          evidenceKeys: ['route.status'],
          strength: 'STRONG',
        },
      ],
      draftAnswer: '一定可以走',
      requiredEvidence: [
        {
          key: 'route.status',
          required: true,
          importance: 'CRITICAL',
          acceptableSources: ['WORLD_STATE'],
          onMissing: 'FETCH',
        },
      ],
    });
    /** ASSUMED critical live → 可能降级；强制用已产出的 claims 跑 Eval */
    const evalResult = evaluateClaimGroundingForHarness({
      ...trace,
      routeDecision: { ...trace.routeDecision, answerMode: 'STRONG' },
      claims: [
        {
          claimId: 'c_bad',
          type: 'FEASIBILITY',
          text: '一定可以走',
          evidenceKeys: ['route.status'],
          strength: 'STRONG',
        },
      ],
      groundingResult: [
        {
          claimId: 'c_bad',
          status: 'GROUNDED',
          strengthAllowed: 'WEAK',
          reason: 'forced',
        },
      ],
    });
    expect(evalResult.passed).toBe(false);
    expect(evalResult.strongWithoutVerified).toBe(true);
    expect(evalResult.violations.map((v) => v.code)).toEqual(
      expect.arrayContaining(['STRONG_CLAIM_WITHOUT_VERIFIED']),
    );
  });
});
