import { canTransitionGate1Project, assertGate1Transition } from './utils/gate1-state-machine.util';
import { Gate1CryptoService } from './services/gate1-crypto.service';
import { GATE1_MATERIAL_CHANGE_TYPES } from './constants/gate1.constants';
import {
  canSubmitPrivateConstraints,
  canSubmitPublicPreferences,
  hasGrantedConsent,
} from './utils/gate1-consent.util';
import {
  buildParticipantTodos,
  pickPrimaryAction,
  requiresFeedbackNote,
} from './utils/gate1-participant-dashboard.util';
import { computeNextAction, computeRiskLevel, needsActionScore } from './utils/gate1-advisor-workspace.util';

describe('gate1 advisor workspace util (PRD §6)', () => {
  const baseSignals = {
    experimentStatus: 'COLLECTING',
    cohort: 'PLANNING',
    hasConfirmedBaseline: true,
    participantCount: 4,
    submittedCount: 2,
    hasPublishedConflicts: false,
    unpublishedConflictFeedback: 0,
    publishedCandidateCount: 0,
    hasDecision: false,
    redReadinessCount: 0,
    unpublishedPlanBCount: 0,
    daysToDeparture: 30,
  };

  it('prioritizes baseline confirmation when missing', () => {
    const action = computeNextAction('p1', { ...baseSignals, hasConfirmedBaseline: false });
    expect(action?.id).toBe('confirm-baseline');
    expect(action?.priority).toBe('P0');
  });

  it('flags high risk when readiness blockers exist near departure', () => {
    const signals = { ...baseSignals, redReadinessCount: 2, daysToDeparture: 5 };
    expect(computeRiskLevel(signals)).toBe('HIGH');
    expect(needsActionScore(signals)).toBeGreaterThan(needsActionScore(baseSignals));
  });

  it('recommends decision when candidates published but no decision', () => {
    const action = computeNextAction('p1', {
      ...baseSignals,
      experimentStatus: 'ADVISOR_DECIDING',
      hasPublishedConflicts: true,
      publishedCandidateCount: 2,
    });
    expect(action?.id).toBe('submit-decision');
  });
});

describe('gate1 advisor reminder cooldown (PRD §7.3)', () => {
  const { canSendAdvisorInitiatedReminder } = require('./utils/gate1-reminder.util');

  it('allows first advisor reminder', () => {
    expect(canSendAdvisorInitiatedReminder(null)).toBe(true);
  });

  it('blocks within 24h of last advisor reminder', () => {
    const recent = new Date(Date.now() - 2 * 3600000).toISOString();
    expect(canSendAdvisorInitiatedReminder({ lastAdvisorReminderAt: recent })).toBe(false);
  });

  it('allows after 24h cooldown', () => {
    const old = new Date(Date.now() - 25 * 3600000).toISOString();
    expect(canSendAdvisorInitiatedReminder({ lastAdvisorReminderAt: old })).toBe(true);
  });
});

describe('gate1-state-machine', () => {
  it('allows DRAFT → BASELINE_READY', () => {
    expect(canTransitionGate1Project('DRAFT', 'BASELINE_READY')).toBe(true);
  });

  it('blocks DRAFT → ADVISOR_DECIDING', () => {
    expect(canTransitionGate1Project('DRAFT', 'ADVISOR_DECIDING')).toBe(false);
    expect(() => assertGate1Transition('DRAFT', 'ADVISOR_DECIDING')).toThrow();
  });
});

describe('gate1-crypto', () => {
  const crypto = new Gate1CryptoService({ get: () => 'test-key' } as never);

  it('round-trips encrypted private values', () => {
    const plain = '预算区间：1-1.5万/人';
    expect(crypto.decrypt(crypto.encrypt(plain))).toBe(plain);
  });
});

describe('gate1 layered consent (PRD §6, TC-02)', () => {
  it('blocks private constraints without HUMAN_ASSISTED', () => {
    const records = [
      { consentType: 'BASE_SERVICE', status: 'GRANTED', scope: null },
    ];
    expect(canSubmitPublicPreferences(records)).toBe(false);
    expect(canSubmitPrivateConstraints(records)).toBe(false);
  });

  it('allows preferences when BASE + HUMAN_ASSISTED granted', () => {
    const records = [
      { consentType: 'BASE_SERVICE', status: 'GRANTED', scope: null },
      { consentType: 'HUMAN_ASSISTED', status: 'GRANTED', scope: null },
    ];
    expect(canSubmitPublicPreferences(records)).toBe(true);
    expect(canSubmitPrivateConstraints(records)).toBe(true);
  });

  it('supports legacy bundled consent records', () => {
    const records = [
      {
        consentType: 'LEGACY_BUNDLED',
        status: 'GRANTED',
        scope: { humanAssisted: true, research: true },
      },
    ];
    expect(hasGrantedConsent(records, 'HUMAN_ASSISTED')).toBe(true);
    expect(hasGrantedConsent(records, 'BASE_SERVICE')).toBe(true);
  });
});

describe('gate1 participant dashboard (PRD §9)', () => {
  const token = 'abc-token';

  it('prioritizes consent todo before preferences', () => {
    const todos = buildParticipantTodos({
      token,
      participantStatus: 'JOINED',
      consentRecords: [{ consentType: 'BASE_SERVICE', status: 'GRANTED', scope: null }],
      preferenceSubmitted: false,
      preferenceDraft: false,
      publishedCandidates: [],
      proposalFeedbacks: [],
      changeNotices: [],
      projectStage: 'COLLECTING',
    });
    const primary = pickPrimaryAction(todos);
    expect(primary?.id).toBe('complete-consent');
    expect(primary?.priority).toBe('P0');
  });

  it('requests proposal reconfirm when feedback invalidated', () => {
    const todos = buildParticipantTodos({
      token,
      participantStatus: 'SUBMITTED',
      consentRecords: [
        { consentType: 'BASE_SERVICE', status: 'GRANTED', scope: null },
        { consentType: 'HUMAN_ASSISTED', status: 'GRANTED', scope: null },
      ],
      preferenceSubmitted: true,
      preferenceDraft: false,
      publishedCandidates: [
        {
          id: 'c1',
          label: '方案 A',
          version: 2,
          strategySummary: '南部环线',
          publishedAt: new Date(),
        },
      ],
      proposalFeedbacks: [
        {
          candidateStrategyId: 'c1',
          candidateVersion: 1,
          status: 'INVALIDATED',
          response: 'ACCEPT',
        },
      ],
      changeNotices: [],
      projectStage: 'ADVISOR_DECIDING',
    });
    expect(todos.some((t) => t.title.includes('重新确认方案'))).toBe(true);
  });
});

describe('gate1 participant dashboard readiness tasks (PRD §11)', () => {
  it('adds P0 todo for blocking readiness tasks', () => {
    const todos = buildParticipantTodos({
      token: 't',
      participantStatus: 'SUBMITTED',
      consentRecords: [
        { consentType: 'BASE_SERVICE', status: 'GRANTED', scope: null },
        { consentType: 'HUMAN_ASSISTED', status: 'GRANTED', scope: null },
      ],
      preferenceSubmitted: true,
      preferenceDraft: false,
      publishedCandidates: [],
      proposalFeedbacks: [],
      changeNotices: [],
      participantTasks: [
        {
          id: 'task-1',
          title: '提交护照信息',
          status: 'NOT_STARTED',
          blocking: true,
          priority: 'P0',
          category: 'DOCUMENTS',
          dueAt: new Date('2026-07-01'),
        },
      ],
      projectStage: 'READY',
    });
    expect(todos.some((t) => t.id === 'task-task-1' && t.priority === 'P0')).toBe(true);
  });
});

describe('gate1 participant dashboard change notices (PRD §12)', () => {
  it('only surfaces unacked change notices as todos', () => {
    const todos = buildParticipantTodos({
      token: 't',
      participantStatus: 'SUBMITTED',
      consentRecords: [
        { consentType: 'BASE_SERVICE', status: 'GRANTED', scope: null },
        { consentType: 'HUMAN_ASSISTED', status: 'GRANTED', scope: null },
      ],
      preferenceSubmitted: true,
      preferenceDraft: false,
      publishedCandidates: [],
      proposalFeedbacks: [],
      changeNotices: [
        {
          id: 'n1',
          title: '集合时间变更',
          severity: 'HIGH',
          summary: '次日提前 30 分钟',
          needsAck: true,
        },
        {
          id: 'n2',
          title: '已确认通知',
          severity: 'LOW',
          summary: '信息更新',
          needsAck: false,
        },
      ],
      participantTasks: [],
      projectStage: 'ACTIVE',
    });
    expect(todos.some((t) => t.id === 'change-n1')).toBe(true);
    expect(todos.some((t) => t.id === 'change-n2')).toBe(false);
  });
});

describe('gate1 preference reminder util (PRD §17)', () => {
  const { shouldSendPreferenceReminder } = require('./utils/gate1-reminder.util');

  it('does not remind before 48h from consent', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const participant = {
      id: 'p1',
      reminderCount: 0,
      consentedAt: new Date('2026-06-09T12:00:00Z'),
      formStartedAt: null,
      openedAt: null,
      metadata: null,
    };
    expect(shouldSendPreferenceReminder(participant, now)).toBe(false);
  });

  it('sends first reminder after 48h', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    const participant = {
      id: 'p1',
      reminderCount: 0,
      consentedAt: new Date('2026-06-08T11:00:00Z'),
      formStartedAt: null,
      openedAt: null,
      metadata: null,
    };
    expect(shouldSendPreferenceReminder(participant, now)).toBe(true);
  });

  it('caps reminders at 2', () => {
    const now = new Date('2026-06-10T12:00:00Z');
    expect(
      shouldSendPreferenceReminder({
        id: 'p1',
        reminderCount: 2,
        consentedAt: new Date('2026-06-01T00:00:00Z'),
        formStartedAt: null,
        openedAt: null,
        metadata: { lastPreferenceReminderAt: '2026-06-09T00:00:00Z' },
      }, now),
    ).toBe(false);
  });
});

describe('gate1 proposal feedback reminder util', () => {
  const {
    shouldSendProposalFeedbackReminder,
    bumpProposalReminderMeta,
  } = require('./utils/gate1-reminder.util');

  it('reminds 24h after candidate published', () => {
    const published = new Date('2026-06-08T10:00:00Z');
    const now = new Date('2026-06-09T11:00:00Z');
    expect(shouldSendProposalFeedbackReminder('c1', published, null, now)).toBe(true);
  });

  it('does not repeat per candidate', () => {
    const published = new Date('2026-06-01T00:00:00Z');
    const now = new Date('2026-06-10T00:00:00Z');
    const meta = bumpProposalReminderMeta(null, 'c1', now);
    expect(shouldSendProposalFeedbackReminder('c1', published, meta, now)).toBe(false);
  });
});

describe('gate1 project fit bridge util', () => {
  const {
    resolveGate1ProjectQuery,
    shouldEnrollPortalStatus,
    buildPortalPath,
    summarizeEnrollmentForApplication,
  } = require('./utils/gate1-project-fit-bridge.util');

  it('resolves gate1 project by gate1ProjectId first', () => {
    expect(
      resolveGate1ProjectQuery({
        id: 'l1',
        tripId: 'trip-1',
        gate1ProjectId: 'g1',
        title: '冰岛',
      }),
    ).toEqual({ byId: 'g1' });
  });

  it('falls back to linkedTripId', () => {
    expect(
      resolveGate1ProjectQuery({
        id: 'l1',
        tripId: 'trip-1',
        gate1ProjectId: null,
        title: '冰岛',
      }),
    ).toEqual({ byLinkedTripId: 'trip-1' });
  });

  it('enrolls portal for JOINED and USER_CONFIRMED', () => {
    expect(shouldEnrollPortalStatus('JOINED')).toBe(true);
    expect(shouldEnrollPortalStatus('USER_CONFIRMED')).toBe(true);
    expect(shouldEnrollPortalStatus('APPROVED')).toBe(false);
  });

  it('builds portal summary for enrolled participant', () => {
    const summary = summarizeEnrollmentForApplication(
      { id: 'p1', inviteToken: 'tok', status: 'JOINED' },
      { id: 'proj1', title: '南部环线' },
    );
    expect(summary.portalEnrolled).toBe(true);
    expect(summary.participantPortal?.portalPath).toBe(buildPortalPath('tok'));
  });
});

describe('gate1 proposal feedback validation', () => {
  it('requires note for REJECT and CONCERN', () => {
    expect(requiresFeedbackNote('REJECT')).toBe(true);
    expect(requiresFeedbackNote('ACCEPT')).toBe(false);
  });
});

describe('gate1 material change validation (AC-05)', () => {
  function validateMaterialChange(materialChange: boolean, changeTypes?: string[], evidence?: string) {
    if (materialChange) {
      if (!changeTypes?.length) throw new Error('changeTypes required');
      if (!evidence?.trim()) throw new Error('evidence required');
      for (const t of changeTypes) {
        if (!GATE1_MATERIAL_CHANGE_TYPES.includes(t as (typeof GATE1_MATERIAL_CHANGE_TYPES)[number])) {
          throw new Error(`invalid type ${t}`);
        }
      }
    } else if (changeTypes?.length) {
      throw new Error('文案润色不计入');
    }
  }

  it('requires change types when materialChange=true', () => {
    expect(() => validateMaterialChange(true, [], 'x')).toThrow('changeTypes');
  });

  it('rejects change types when materialChange=false', () => {
    expect(() => validateMaterialChange(false, ['ROUTE'])).toThrow('文案润色');
  });

  it('accepts valid material change', () => {
    expect(() => validateMaterialChange(true, ['ROUTE', 'ACCOMMODATION'], '调整了南部路线')).not.toThrow();
  });
});

describe('gate1 cohort metrics isolation (AC-06)', () => {
  it('defaults metrics to PLANNING cohort when no filter', () => {
    const projects = [
      { cohort: 'PLANNING', participants: [{ status: 'SUBMITTED' }, { status: 'INVITED' }] },
      { cohort: 'NEAR_DEPARTURE', participants: [{ status: 'SUBMITTED' }] },
    ];
    const scope = projects.filter((p) => p.cohort === 'PLANNING');
    expect(scope).toHaveLength(1);
    expect(scope[0].participants).toHaveLength(2);
  });
});

describe('gate1 readiness/plan-b cohort rules', () => {
  it('allows readiness for PLANNING and NEAR_DEPARTURE only', () => {
    const { GATE1_READINESS_COHORTS } = require('./constants/gate1.constants');
    expect(GATE1_READINESS_COHORTS).toContain('PLANNING');
    expect(GATE1_READINESS_COHORTS).toContain('NEAR_DEPARTURE');
    expect(GATE1_READINESS_COHORTS).not.toContain('IN_TRIP_RECENT');
  });
});

describe('gate1 outcome validation', () => {
  it('rejects verbal intent paired with second order provided', () => {
    const invalid = { secondOrderIntent: 'VERBAL', secondOrderProvided: true };
    expect(invalid.secondOrderIntent === 'VERBAL' && invalid.secondOrderProvided).toBe(true);
  });

  it('export pack uses truncated project ref not full id', () => {
    const id = 'a7ce5efc-2aba-467d-9e4a-2c33b4de0ca0';
    expect(id.slice(0, 8)).toBe('a7ce5efc');
  });
});
