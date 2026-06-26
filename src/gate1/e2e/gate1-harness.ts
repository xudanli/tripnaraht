import { ConfigService } from '@nestjs/config';
import { Gate1MemoryStore, buildGate1Prisma, GATE1_E2E_IDS } from './gate1-memory-store';
import { Gate1AnalyticsService, Gate1GuardService } from '../services/gate1-support.services';
import { Gate1ProjectService, Gate1BaselineService } from '../services/gate1-project.service';
import { Gate1ParticipantService } from '../services/gate1-participant.service';
import { Gate1ConflictService, Gate1CandidateService } from '../services/gate1-output.services';
import { Gate1DecisionService } from '../services/gate1-decision.service';
import { Gate1PrivacyService } from '../services/gate1-privacy.service';
import { Gate1AccessService } from '../services/gate1-access.service';
import { Gate1AdvisorWorkspaceService } from '../services/gate1-advisor-workspace.service';
import { Gate1ParticipantReminderService } from '../services/gate1-participant-reminder.service';
import { Gate1CryptoService } from '../services/gate1-crypto.service';

function mockRuntimeEvents() {
  return {
    resolveAnchor: async () => null,
    participantConsented: async () => null,
    constraintRecorded: async () => null,
    privateConstraintSummarized: async () => null,
    conflictDetected: async () => null,
    conflictAdvisorFeedback: async () => null,
    candidateStrategyCreated: async () => null,
    decisionRecorded: async () => null,
    contingencyPlanCreated: async () => null,
    outcomeRecorded: async () => null,
    sensitiveDataAccessed: async () => null,
    readinessBlockerRaised: async () => null,
  };
}

function mockConfig(): ConfigService {
  return {
    get: (key: string) => {
      if (key === 'GATE1_FIELD_ENCRYPTION_KEY') return 'gate1-e2e-test-key';
      if (key === 'GATE1_OPS_USER_IDS') return GATE1_E2E_IDS.ops;
      return undefined;
    },
  } as ConfigService;
}

function mockNotifications() {
  return {
    queueAndSend: async () => ({ sent: true }),
  };
}

export type Gate1Harness = {
  store: Gate1MemoryStore;
  ids: typeof GATE1_E2E_IDS;
  projects: Gate1ProjectService;
  baselines: Gate1BaselineService;
  participants: Gate1ParticipantService;
  conflicts: Gate1ConflictService;
  candidates: Gate1CandidateService;
  decisions: Gate1DecisionService;
  privacy: Gate1PrivacyService;
  access: Gate1AccessService;
  workspace: Gate1AdvisorWorkspaceService;
  analytics: Gate1AnalyticsService;
  reminders: Gate1ParticipantReminderService;
  crypto: Gate1CryptoService;
};

export function createGate1Harness(): Gate1Harness {
  const store = new Gate1MemoryStore();
  store.seedActors();
  const prisma = buildGate1Prisma(store);
  const config = mockConfig();
  const guard = new Gate1GuardService(prisma);
  const analytics = new Gate1AnalyticsService(prisma);
  const access = new Gate1AccessService(prisma, guard, config);
  const crypto = new Gate1CryptoService(config);
  const notifications = mockNotifications();
  const runtimeEvents = mockRuntimeEvents();

  const linkedTripAnchor = {
    ensureOnCreate: async () => null,
    backfillProject: async () => ({
      projectId: '',
      linkedTripId: null,
      action: 'failed' as const,
    }),
  } as never;
  const projects = new Gate1ProjectService(prisma, analytics, guard, linkedTripAnchor);
  const baselines = new Gate1BaselineService(prisma, analytics, guard);
  const conflicts = new Gate1ConflictService(prisma, guard, analytics, access, runtimeEvents as never);
  const candidates = new Gate1CandidateService(prisma, guard, analytics, runtimeEvents as never);
  const decisions = new Gate1DecisionService(prisma, guard, analytics, runtimeEvents as never);
  const privacy = new Gate1PrivacyService(prisma, guard, crypto, analytics, runtimeEvents as never);
  const participants = new Gate1ParticipantService(
    prisma,
    guard,
    analytics,
    crypto,
    notifications as never,
    runtimeEvents as never,
  );
  const workspace = new Gate1AdvisorWorkspaceService(prisma, guard, analytics);
  const reminders = new Gate1ParticipantReminderService(
    prisma,
    analytics,
    notifications as never,
  );

  return {
    store,
    ids: GATE1_E2E_IDS,
    projects,
    baselines,
    participants,
    conflicts,
    candidates,
    decisions,
    privacy,
    access,
    workspace,
    analytics,
    reminders,
    crypto,
  };
}
