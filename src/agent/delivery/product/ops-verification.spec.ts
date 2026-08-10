import { admitOpsVerificationAction, OPS_MAIN_LOOP } from './ops-verification-discipline.util';
import { buildWeeklyDecisionPage } from './weekly-decision-page.util';
import { evaluateNorthStarWithGuards } from './north-star-with-guards.util';
import { evaluateV11EntryGate } from './v11-entry-gate.util';
import { sealNaraV1Roadmap } from './v1-roadmap-seal.util';

describe('Operations Verification Period', () => {
  it('blocks actions without real Trip/evidence trigger', () => {
    expect(
      admitOpsVerificationAction({
        summaryZh: '想加个新 Agent',
      }).ok,
    ).toBe(false);
    expect(
      admitOpsVerificationAction({
        tripId: 'ICE-018',
        userBehaviorEvidenceRef: 'corr_12',
        incidentId: 'p1_2',
        summaryZh: 'Confirm CTA 不清导致放弃',
      }).ok,
    ).toBe(true);
    expect(OPS_MAIN_LOOP).toEqual([
      'USE',
      'OBSERVE',
      'DIAGNOSE',
      'FIX',
      'VERIFY',
      'RELEASE',
    ]);
  });

  it('Weekly decision page: New Capability=NO and zero RD tasks can be normal', () => {
    const quiet = buildWeeklyDecisionPage({
      weekId: '2026-W33',
      safety: 'PASS',
      reliability: 'PASS',
      taskSuccess: 'PASS',
      experience: 'PASS',
      backlog: [],
      rcDecisionZh: '保持 RC3，继续真实 Trip',
      newCapability: 'NO',
    });
    expect(quiet.zeroNewRdTasksThisWeek).toBe(true);
    expect(quiet.noNewRdTasksIsNormal).toBe(true);
    expect(quiet.newCapability).toBe('NO');

    const watch = buildWeeklyDecisionPage({
      weekId: '2026-W32',
      safety: 'PASS',
      reliability: 'PASS',
      taskSuccess: 'WATCH',
      taskSuccessWatchJourney: 'ADJUST',
      experience: 'WATCH',
      experienceWatchTopicZh: 'Decision explanation',
      backlog: [
        {
          kind: 'P1_TASK_FAILURE',
          tripId: 'ICE-018',
          evidenceRef: 't1',
          summaryZh: 'Adjust abandon',
        },
        {
          kind: 'P1_TASK_FAILURE',
          tripId: 'ICE-019',
          evidenceRef: 't2',
          summaryZh: 'Confirm unclear',
        },
        {
          kind: 'TOP_DATA_GAP',
          tripId: 'ICE-018',
          evidenceRef: 'd1',
          summaryZh: '活动实际完成状态',
        },
        {
          kind: 'TOP_EXPERIENCE_FRICTION',
          tripId: 'ICE-018',
          evidenceRef: 'e1',
          summaryZh: '用户不清楚「已选择」与「已改行程」的区别',
        },
      ],
      rcDecisionZh: 'RC3 → 修 2 个 P1 → RC4',
      newCapability: 'NO',
    });
    expect(watch.p0Count).toBe(0);
    expect(watch.p1Count).toBe(2);
    expect(watch.topDataGapZh).toMatch(/活动实际完成/);
    expect(watch.newCapability).toBe('NO');
  });

  it('North Star guards + V1.1 stays closed', () => {
    const ok = evaluateNorthStarWithGuards({
      tripId: 'ICE-018',
      decisions: [
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
      ],
      unauthorizedOrUnsafeActionCount: 0,
    });
    expect(ok.passed).toBe(true);
    expect(ok.worthParticipatingNotMoreParticipating).toBe(true);

    const regret = evaluateNorthStarWithGuards({
      tripId: 'ICE-018',
      decisions: [
        {
          decisionNeedZh: '高成本住宿',
          naraParticipated: true,
          userCompleted: true,
          outcomeFailed: false,
          severeRegret: true,
        },
      ],
    });
    expect(regret.passed).toBe(false);

    const v11 = evaluateV11EntryGate({
      repeatedTripCount: 3,
      tripsWithSameNeed: 2,
      existingV1CannotSolve: true,
      materialProductValue: true,
      singleUserRequestOnly: true,
    });
    expect(v11.v11NotStarted).toBe(true);
    expect(v11.mayOpenV11Discussion).toBe(false);

    expect(sealNaraV1Roadmap().sealed).toBe(true);
  });
});
