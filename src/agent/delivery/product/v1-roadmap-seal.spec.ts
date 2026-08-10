import { conductWeeklyNaraReleaseReview } from './weekly-release-review.util';
import {
  advanceToNextRc,
  assertRcFixSeverityAllowed,
  startRcDisciplineCycle,
} from './rc-discipline.util';
import { buildTripProductReview } from './trip-product-review.util';
import {
  computeAssistedDecisionRate,
  computeNorthStarForTrip,
} from './trust-signals-north-star.util';
import { evaluateCapabilityAdditionGate } from './capability-addition-gate.util';
import { sealNaraV1Roadmap } from './v1-roadmap-seal.util';

describe('Nara V1 Roadmap Seal & Operating Model', () => {
  it('seals roadmap; next step decided by real beta data', () => {
    const seal = sealNaraV1Roadmap();
    expect(seal.sealed).toBe(true);
    expect(seal.noMoreArchitectureLayers).toBe(true);
    expect(seal.nextStepNotPreWritten).toBe(true);
    expect(seal.architectureArc.at(-1)).toBe('Release Operations');
    expect(seal.guidingQuestionZh).toMatch(/愿意交给 Nara/);
    expect(seal.antiQuestionZh).toMatch(/还能做什么/);
  });

  it('Weekly Review only emits four backlog kinds', () => {
    const review = conductWeeklyNaraReleaseReview({
      weekId: '2026-W32',
      layers: {
        safetyZh: ['无越权'],
        reliabilityZh: ['Apply 超时 1 例已恢复'],
        worstJourneyId: 'ADJUST',
        taskSuccessZh: ['Adjust 最差'],
        experienceZh: ['Confirm CTA 犹豫'],
      },
      backlog: [
        {
          kind: 'P1_TASK_FAILURE',
          tripId: 'ICE-018',
          evidenceRef: 'trace_1',
          summaryZh: 'Adjust Confirm 犹豫后放弃',
        },
        {
          kind: 'TOP_EXPERIENCE_FRICTION',
          tripId: 'ICE-018',
          evidenceRef: 'sess_9',
          summaryZh: 'CTA 文案不清',
        },
      ],
      proposedAgentCapabilityDiscussion: '要不要再加一个 Agent？',
    });
    expect(review.backlog).toHaveLength(2);
    expect(review.reasonsZh.join(' ')).toMatch(/拒绝议程/);
  });

  it('RC discipline pins versions; Trip review prefers trip-level over averages', () => {
    const rc1 = startRcDisciplineCycle({
      rcId: 'RC1',
      sequence: 1,
      pinned: {
        modelVersion: 'm1',
        promptVersion: 'p1',
        ruleVersion: 'r1',
        knowledgePackageVersion: 'k1',
        decisionPolicyVersion: 'd1',
        clientVersion: 'ios-1.2',
      },
    });
    expect(rc1.candidate.allArtifactKindsPresent).toBe(true);
    expect(assertRcFixSeverityAllowed('P0').ok).toBe(true);
    expect(assertRcFixSeverityAllowed('P2').ok).toBe(false);
    const rc2 = advanceToNextRc({ current: rc1, nextRcId: 'RC2' });
    expect(rc2.sequence).toBe(2);

    const trip = buildTripProductReview({
      tripLabel: 'Trip #ICE-018',
      tripId: 'ICE-018',
      safety: 'PASS',
      reliability: 'PASS',
      journeys: [
        { journeyId: 'QUERY', attempts: 10, successes: 9 },
        { journeyId: 'DECIDE', attempts: 5, successes: 4 },
        { journeyId: 'ADJUST', attempts: 3, successes: 2 },
        { journeyId: 'LIVE', attempts: 3, successes: 3 },
        {
          journeyId: 'PROACTIVE',
          attempts: 3,
          successes: 2,
          useful: 2,
          unnecessary: 1,
        },
      ],
      userCorrectionCount: 2,
      recoveryRate: 1,
    });
    expect(trip.overall).toBe('WATCH');
    expect(trip.conversationAverageForbiddenAsPrimary).toBe(true);
    expect(trip.whyOverallZh.join(' ')).toMatch(/Correction|ADJUST|Proactive/i);
  });

  it('North Star = successful assisted decisions; capability gate blocks feature pile-on', () => {
    const decisions = [
      {
        decisionNeedZh: '车型',
        naraParticipated: true,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: '保险',
        naraParticipated: true,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: 'Day1负荷',
        naraParticipated: true,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: '冰川徒步',
        naraParticipated: true,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: 'Day4调整',
        naraParticipated: true,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: '晚点处理',
        naraParticipated: true,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: '餐厅口味',
        naraParticipated: false,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
      {
        decisionNeedZh: '伴手礼',
        naraParticipated: false,
        userCompleted: true,
        outcomeFailed: false,
        severeRegret: false,
      },
    ];
    const rate = computeAssistedDecisionRate(decisions);
    expect(rate.assistedDecisionRate).toBe(0.75);
    expect(rate.notTargetingHundredPercent).toBe(true);

    const ns = computeNorthStarForTrip({ tripId: 'ICE-018', decisions });
    expect(ns.successfulAssistedDecisions).toBe(6);
    expect(ns.metricNameZh).toBe('每趟旅行有效辅助决策数');
    expect(ns.dauForbiddenAsPrimary).toBe(true);

    expect(
      evaluateCapabilityAdditionGate({
        evidenceRef: 'case_1',
        userTaskProven: true,
        existingSystemCannotSolve: false,
        classification: 'NEW_CAPABILITY_CANDIDATE',
        summaryZh: '竞品有 Y',
      }).ok,
    ).toBe(false);

    expect(
      evaluateCapabilityAdditionGate({
        evidenceRef: 'case_2',
        userTaskProven: true,
        existingSystemCannotSolve: true,
        classification: 'UX',
        summaryZh: 'CTA 不清',
      }).ok,
    ).toBe(false);

    const gap = evaluateCapabilityAdditionGate({
      evidenceRef: 'case_3',
      userTaskProven: true,
      existingSystemCannotSolve: true,
      classification: 'NEW_CAPABILITY_CANDIDATE',
      summaryZh: '真实缺口',
    });
    expect(gap.ok).toBe(true);
    if (gap.ok) expect(gap.stillRequiresHumanProductApproval).toBe(true);
  });
});
