import {
  getV1JourneyContract,
  listFrozenV1Journeys,
  V1_JOURNEY_IDS,
} from './v1-journey-contract.util';
import {
  createProductGoldenTrace,
  evaluateProductGoldenTrace,
} from './product-golden-trace.util';
import { projectProductState } from './product-state.util';
import {
  openBetaIncident,
  recordBetaRegression,
  reviewBetaChangeRequest,
  startClosedBetaProgram,
} from './closed-beta.util';
import type { ConversationTurnResultV1 } from '../conversation/conversation-turn-result.types';

describe('Nara V1 Productization & Release Readiness', () => {
  it('freezes six V1 journeys; acceptance unit is user task loop', () => {
    const journeys = listFrozenV1Journeys();
    expect(journeys).toHaveLength(6);
    expect(V1_JOURNEY_IDS).toEqual([
      'QUERY',
      'DECIDE',
      'ADJUST',
      'LIVE',
      'IMPORT',
      'PROACTIVE',
    ]);
    for (const j of journeys) {
      expect(j.noNewArchitectureLayer).toBe(true);
      expect(j.autoApplyClosed).toBe(true);
      expect(j.silentApplyForbidden).toBe(true);
    }
    expect(getV1JourneyContract('PROACTIVE').pushRequiresScenarioDeliveryAuthority).toBe(
      true,
    );
  });

  it('ADJUST product golden covers NL→…→Receipt→Refresh; silent apply fails', () => {
    const ok = createProductGoldenTrace({
      goldenId: 'PG-ADJUST-01',
      journeyId: 'ADJUST',
      naturalLanguageInputZh: '把第二天改轻松一点',
      stageEvidence: {
        NATURAL_LANGUAGE_INPUT: { present: true, summaryZh: '用户请求' },
        CANONICAL_RESULT: { present: true, refId: 'draft_1' },
        CARD: { present: true, refId: 'change_draft' },
        CTA: { present: true, refId: 'confirm_cta' },
        CONFIRM: { present: true, refId: 'user_confirm' },
        APPLY: { present: true, refId: 'apply_1' },
        RECEIPT: { present: true, refId: 'receipt_1' },
        PAGE_STATE_REFRESH: { present: true, summaryZh: 'plan_version++' },
      },
    });
    const verdict = evaluateProductGoldenTrace(ok);
    expect(verdict.acceptanceUnit).toBe('USER_TASK_CLOSED_LOOP');
    expect(verdict.passed).toBe(true);

    const bad = createProductGoldenTrace({
      goldenId: 'PG-ADJUST-silent',
      journeyId: 'ADJUST',
      naturalLanguageInputZh: '改行程',
      stageEvidence: {
        NATURAL_LANGUAGE_INPUT: { present: true },
        CANONICAL_RESULT: { present: true },
        CARD: { present: true },
        CTA: { present: true },
        CONFIRM: { present: false },
        APPLY: { present: true },
        RECEIPT: { present: true },
        PAGE_STATE_REFRESH: { present: true },
      },
      silentApplyAttempted: true,
      autoApplyAttempted: true,
    });
    const badV = evaluateProductGoldenTrace(bad);
    expect(badV.passed).toBe(false);
    expect(badV.missingStages).toContain('CONFIRM');
    expect(badV.forbiddenViolations).toContain('silent_apply_forbidden');
    expect(badV.forbiddenViolations).toContain('auto_apply_closed');
  });

  it('QUERY golden does not require Apply; Product State hides internals', () => {
    const trace = createProductGoldenTrace({
      goldenId: 'PG-QUERY-01',
      journeyId: 'QUERY',
      naturalLanguageInputZh: '哪一天没有住宿？',
      stageEvidence: {
        NATURAL_LANGUAGE_INPUT: { present: true },
        CANONICAL_RESULT: { present: true, refId: 'trip_fact' },
        CARD: { present: true },
        CTA: { present: true },
        PAGE_STATE_REFRESH: { present: true },
      },
    });
    expect(evaluateProductGoldenTrace(trace).passed).toBe(true);

    const turn: ConversationTurnResultV1 = {
      schema_id: 'tripnara.conversation_turn_result@v1',
      version: 1,
      request_id: 'r1',
      trip_id: 't1',
      lifecycle: 'PLANNING',
      primary_card: 'trip_fact',
      cards: [
        {
          kind: 'trip_fact',
          title_zh: '缺住提醒',
          body_zh: '第3天没有住宿',
        },
      ],
      actions: [
        {
          id: 'a1',
          kind: 'client_navigation',
          label_zh: '查看日程',
        },
      ],
      delivery: {
        verdict: 'VERIFIED',
        user_confirm_required: false,
        flawed_present: false,
      },
      answer_text: '第3天没有住宿',
      context: {
        schema_id: 'tripnara.trip_conversation_context@v1',
        trip_id: 't1',
        plan_version: 3,
        lifecycle: 'PLANNING',
        unresolved_risks_zh: [],
        open_decisions_zh: [],
        open_decision_count: 0,
        open_risk_count: 0,
      },
    };

    const state = projectProductState({
      tripId: 't1',
      turn,
      latestJourneyId: 'QUERY',
      applySucceeded: false,
    });
    expect(state.hidesInternalArchitecture).toBe(true);
    expect(state.capabilityReadyIsNotProductReady).toBe(true);
    expect(state.planVersion).toBe(3);
    expect(state.latestCardKinds).toContain('trip_fact');
  });

  it('Closed Beta blocks new architecture; allows stability fixes; records regression', () => {
    const program = startClosedBetaProgram({ programId: 'beta_v1' });
    expect(program.architectureFrozen).toBe(true);
    expect(program.capabilityReadyIsNotProductReady).toBe(true);

    expect(
      reviewBetaChangeRequest({
        program,
        category: 'NEW_TEMPORAL_ABSTRACTION',
      }).allowed,
    ).toBe(false);
    expect(
      reviewBetaChangeRequest({
        program,
        category: 'AUTO_APPLY',
      }).allowed,
    ).toBe(false);
    expect(
      reviewBetaChangeRequest({
        program,
        category: 'STABILITY',
      }).allowed,
    ).toBe(true);

    const incident = openBetaIncident({
      tripId: 'real_trip_1',
      category: 'USER_UNDERSTANDING',
      summaryZh: '用户看不懂确认按钮',
      severity: 'P1',
      journeyId: 'ADJUST',
    });
    expect(incident.status).toBe('OPEN');

    const reg = recordBetaRegression({
      tripId: 'real_trip_1',
      journeyId: 'ADJUST',
      goldenId: 'PG-ADJUST-01',
      status: 'PASS',
    });
    expect(reg.status).toBe('PASS');
  });
});
