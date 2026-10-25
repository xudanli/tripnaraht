/**
 * System1 Runtime Golden Cases（停扩路径后的验收闸）。
 *
 * Case 1 Safety Feasibility — 明天还能走 F208 吗？
 * Case 2 Trip Query — 哪一天没有住宿？
 * Case 3 Recommendation — 冰河湖和钻石沙滩哪个更值得去？
 *   刻意断言：不会因缺天气 INSUFFICIENT 拒答。
 */

import { applyRouteAndRunEntryRoutingInPlace } from '../routing/route-and-run-route-class-fork.util';
import { readAgentTaskContract } from '../harness/compile-agent-task-contract.util';
import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import {
  buildKnowledgeQaClaims,
  compileSystem1TaskFrame,
  evaluateEvidenceSufficiency,
  evaluateSystem1Authority,
  getRequiredEvidenceSpec,
  groundSystem1Claims,
  inferSystem1CandidateClaimTypes,
  projectSystem1TurnTrace,
  resolveSystem1RequiredEvidence,
  resolveSystem1RuntimeFamily,
  runSystem1DecisionRuntime,
  type System1Evidence,
} from './index';

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
    sourceType: key.startsWith('trip.') ? 'TRIP_STATE' : 'WORLD_STATE',
    value,
    status,
  };
}

describe('System1 Runtime Golden Cases', () => {
  describe('Case 1 — Safety Feasibility（明天还能走 F208 吗？）', () => {
    const message = '明天还能走 F208 吗？';

    it('TaskFrame = FEASIBILITY / ASSESS / HIGH，Family = LIVE_FEASIBILITY', () => {
      const frame = compileSystem1TaskFrame({ message, tripId: TRIP });
      expect(frame.questionType).toBe('FEASIBILITY');
      expect(frame.requestedAction).toBe('ASSESS');
      expect(frame.riskLevel).toBe('HIGH');
      expect(frame.temporalScope?.type).toBe('TOMORROW');
      expect(evaluateSystem1Authority(frame, message).allowed).toBe(true);
      expect(resolveSystem1RuntimeFamily(frame, null, message)).toBe('LIVE_FEASIBILITY');
      expect(inferSystem1CandidateClaimTypes(frame)).toContain('FEASIBILITY');
    });

    it('RequiredEvidence 含 road / weather / vehicle；缺路况不得 STRONG', () => {
      const frame = compileSystem1TaskFrame({ message, tripId: TRIP });
      const required = resolveSystem1RequiredEvidence({
        family: 'LIVE_FEASIBILITY',
        candidateClaimTypes: inferSystem1CandidateClaimTypes(frame),
      });
      expect(required.map((r) => r.key)).toEqual(
        expect.arrayContaining(['route.status', 'weather.wind', 'vehicle.profile']),
      );
      const missingRoad = evaluateEvidenceSufficiency({
        required,
        evidence: [
          ev('weather.wind', 'VERIFIED', '风力低'),
          ev('vehicle.profile', 'VERIFIED', '两驱'),
          ev('trip.current_location', 'VERIFIED', '雷克雅未克'),
        ],
      });
      expect(missingRoad.status).toMatch(/INSUFFICIENT|PARTIAL/);
      expect(missingRoad.answerMode).not.toBe('STRONG');
    });

    it('路况+天气 VERIFIED 后可 SUFFICIENT；Claim 可 GROUNDED', () => {
      const required = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
      const evidence = [
        ev('route.status', 'VERIFIED', 'F208 季节性关闭 CLOSED', 'road'),
        ev('weather.wind', 'VERIFIED', '阵风偏大', 'wx'),
        ev('vehicle.profile', 'VERIFIED', '两驱', 'veh'),
        ev('trip.current_location', 'VERIFIED', '雷克雅未克', 'loc'),
      ];
      const sufficiency = evaluateEvidenceSufficiency({ required, evidence });
      expect(sufficiency.status).toBe('SUFFICIENT');
      const grounded = groundSystem1Claims({
        claims: [
          {
            claimId: 'c_f208',
            type: 'FEASIBILITY',
            text: '明天不建议走 F208',
            evidenceKeys: ['route.status', 'weather.wind'],
            strength: 'STRONG',
          },
        ],
        evidence,
      });
      expect(grounded.grounded.some((c) => c.claimId === 'c_f208')).toBe(true);
      expect(grounded.result.find((g) => g.claimId === 'c_f208')?.status).toBe('GROUNDED');
    });
  });

  describe('Case 2 — Information Query（哪一天没有住宿？）', () => {
    const message = '哪一天没有住宿？';

    it('TaskFrame = STATE_QUERY；Family = TRIP_QUERY_LODGING；不进 Planning/WRITE', () => {
      const frame = compileSystem1TaskFrame({ message, tripId: TRIP });
      expect(frame.questionType).toBe('STATE_QUERY');
      expect(frame.requestedAction).toBe('READ');
      expect(frame.target?.type).toBe('LODGING');
      expect(evaluateSystem1Authority(frame, message).allowed).toBe(true);
      expect(resolveSystem1RuntimeFamily(frame, 'TRIP_QUERY_LODGING', message)).toBe(
        'TRIP_QUERY_LODGING',
      );
      expect(inferSystem1CandidateClaimTypes(frame)).toEqual(['STATE_FACT']);
    });

    it('Harness 合同是 TRIP_QUERY，禁止 Full Planning', () => {
      const req = {
        request_id: 'golden-case2',
        user_id: 'u',
        trip_id: TRIP,
        message: `${message}\n\n[日程] Day1`,
        options: {
          intent_mode: 'TRIP_PLANNING',
          use_state_machine_orchestration: true,
          entry_point: 'itinerary_day_editor',
        },
      } as RouteAndRunRequestDto;
      applyRouteAndRunEntryRoutingInPlace(req);
      const c = readAgentTaskContract(req)!;
      expect(c.taskType).toBe('TRIP_QUERY');
      expect(c.allowFullPlanning).toBe(false);
      expect(req.options?.intent_mode).toBe('DATA_LOOKUP');
    });

    it('有 day_list + accommodation_anchors → STRONG STATE 答', () => {
      const trace = runSystem1DecisionRuntime({
        message,
        tripId: TRIP,
        family: 'TRIP_QUERY_LODGING',
        evidence: [
          {
            evidenceId: 'd',
            key: 'trip.day_list',
            sourceType: 'TRIP_STATE',
            value: { dayCount: 7 },
            status: 'VERIFIED',
          },
          {
            evidenceId: 'a',
            key: 'trip.accommodation_anchors',
            sourceType: 'TRIP_STATE',
            value: { missingDayNumbers: [3] },
            status: 'VERIFIED',
          },
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
      expect(trace.sufficiency?.status).toBe('SUFFICIENT');
      expect(trace.routeDecision.answerMode).toBe('STRONG');
      expect(trace.routeDecision.recommendedRoute).toBe('SYSTEM1_ANSWER');
    });
  });

  describe('Case 3 — Recommendation（冰河湖和钻石沙滩哪个更值得去？）', () => {
    const message = '冰河湖和钻石沙滩哪个更值得去？';

    it('是软推荐，不是 Safety / Weather / Decision 开卡', () => {
      const frame = compileSystem1TaskFrame({ message, tripId: TRIP });
      expect(frame.questionType).toBe('RECOMMEND');
      expect(frame.requestedAction).toBe('RECOMMEND');
      expect(frame.riskLevel).toBe('LOW');
      expect(frame.target?.name).toBe('冰河湖');
      const family = resolveSystem1RuntimeFamily(frame, null, message);
      expect(family).toBe('KNOWLEDGE_QA');
      expect(family).not.toBe('LIVE_FEASIBILITY');
      expect(family).not.toBe('WEATHER_ROAD_QA');
      expect(family).not.toBe('DECISION_SUPPORT');
      expect(inferSystem1CandidateClaimTypes(frame)).toEqual(['RECOMMENDATION']);
    });

    it('只有 Knowledge 命中、没有天气/路况 → 仍可答，不得 INSUFFICIENT 拒答', () => {
      const frame = compileSystem1TaskFrame({ message, tripId: TRIP });
      const claimTypes = inferSystem1CandidateClaimTypes(frame);
      const required = resolveSystem1RequiredEvidence({
        family: 'KNOWLEDGE_QA',
        candidateClaimTypes: claimTypes,
      });
      expect(required.map((r) => r.key)).toEqual(['knowledge.hit']);
      expect(required.every((r) => r.key !== 'weather.wind')).toBe(true);
      expect(required.every((r) => r.key !== 'route.status')).toBe(true);

      const evidence: System1Evidence[] = [
        {
          evidenceId: 'k1',
          key: 'knowledge.hit',
          sourceType: 'KNOWLEDGE',
          value: '冰河湖与钻石沙滩相邻，都值得短停；若只能选一，冰河湖景观更完整。',
          status: 'VERIFIED',
        },
      ];
      const sufficiency = evaluateEvidenceSufficiency({ required, evidence });
      expect(sufficiency.status).toBe('SUFFICIENT');
      expect(sufficiency.answerMode).toBe('STRONG');

      // 即便 Family 误成 LIVE，Claim-driven 仍只要求知识
      const misrouted = resolveSystem1RequiredEvidence({
        family: 'LIVE_FEASIBILITY',
        candidateClaimTypes: ['RECOMMENDATION'],
      });
      expect(misrouted.map((r) => r.key)).toEqual(['knowledge.hit']);
      expect(
        evaluateEvidenceSufficiency({ required: misrouted, evidence }).status,
      ).toBe('SUFFICIENT');

      const liveRequired = getRequiredEvidenceSpec('LIVE_FEASIBILITY');
      const wronglyAsSafety = evaluateEvidenceSufficiency({
        required: liveRequired,
        evidence,
      });
      expect(wronglyAsSafety.status).toMatch(/INSUFFICIENT|PARTIAL/);

      const trace = runSystem1DecisionRuntime({
        message,
        tripId: TRIP,
        family: 'KNOWLEDGE_QA',
        evidence,
        claims: buildKnowledgeQaClaims({
          text: '两者都值得；时间紧优先冰河湖。',
          asRecommendation: true,
        }),
        draftAnswer: '两者都值得；时间紧优先冰河湖。',
      });
      expect(trace.candidateClaimTypes).toEqual(['RECOMMENDATION']);
      expect(trace.requiredEvidence.map((r) => r.key)).toEqual(['knowledge.hit']);
      expect(trace.sufficiency?.status).toBe('SUFFICIENT');
      expect(trace.routeDecision.answerMode).toBe('STRONG');
      expect(trace.routeDecision.recommendedRoute).toBe('SYSTEM1_ANSWER');
      expect(trace.finalAnswer).not.toMatch(/缺少实时天气|INSUFFICIENT|拒答/);
      const projected = projectSystem1TurnTrace(trace);
      expect((projected.claim_grounding_eval as any).passed).toBe(true);
      expect((projected.claim_grounding_eval as any).soft_recommend_blocked_by_safety).toBe(
        false,
      );
    });
  });
});
