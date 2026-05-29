/**
 * SkillEvolver ↔ TripDecision E2E Replay 桥接
 * - 默认：fixture mock（与 td-replay-matrix 一致）
 * - SKILL_EVOLVER_LIVE_DECISION_REPLAY=true：真实 TripDecisionEngineService
 */
import { randomUUID } from 'crypto';
import { E2EReplayService } from '../../../../trips/decision/evaluation/e2e-replay.service';
import type { E2ECase, E2EReplayResult } from '../../../../trips/decision/evaluation/e2e-case.types';
import { findTdReplayFixtureById } from '../../../../trips/decision/evaluation/e2e-cases/registry';
import {
  buildDecisionLogsForFixture,
  buildGeneratePlanResultForFixture,
} from '../../../../trips/decision/evaluation/e2e-replay.fixture-mocks';
import type { TripDecisionEngineService } from '../../../../trips/decision/trip-decision-engine.service';
import type { DecisionLogStorageService } from '../../../../trips/decision/services/decision-log-storage.service';
import type { EvolvableSkill, SkillTrajectory, TrajectoryStep } from '../interfaces/skill-evolver.types';
import { isLiveDecisionReplayEnabled, runLiveE2eReplay } from './live-e2e-replay.harness';

export function resolveE2eCaseForReplay(sourceE2eCaseId: string): E2ECase | undefined {
  return findTdReplayFixtureById(sourceE2eCaseId);
}

export function createFixtureE2eReplayService(testCase: E2ECase): E2EReplayService {
  const decisionEngine = {
    generatePlan: async () => buildGeneratePlanResultForFixture(testCase),
  } as unknown as TripDecisionEngineService;
  const logStorage = {
    queryLogs: async () => buildDecisionLogsForFixture(testCase),
  } as unknown as DecisionLogStorageService;
  return new E2EReplayService(decisionEngine, logStorage);
}

export function mapE2eReplayToTrajectory(
  replay: E2EReplayResult,
  skill: EvolvableSkill,
): SkillTrajectory {
  const steps: TrajectoryStep[] = replay.actual.logs.map((log, i) => {
    const action = `${log.persona} ${log.action} ${(log.reasonCodes ?? []).join(' ')}`.trim();
    return {
      stepIndex: i,
      observation: replay.case.input.userQuery,
      thought: log.explanation,
      action,
      result: log.explanation,
      isError: log.action === 'REJECT',
      timestamp: log.timestamp ?? new Date().toISOString(),
    };
  });

  const diffSummary = replay.diff.hasDiff
    ? JSON.stringify(replay.diff).slice(0, 2000)
    : undefined;

  return {
    trajectoryId: randomUUID(),
    skillId: skill.skillId,
    skillVersion: skill.version,
    taskIds: [replay.case.id],
    steps,
    taskCompleted: replay.passed,
    skillContentSnapshot: skill.body.slice(0, 2000),
    evalMode: 'decision_replay',
    decisionReplayPassed: replay.passed,
    decisionReplayDiffSummary: diffSummary,
    liveDecisionReplay: isLiveDecisionReplayEnabled(),
    createdAt: new Date().toISOString(),
  };
}

export async function runE2eReplayTrajectory(
  sourceE2eCaseId: string,
  skill: EvolvableSkill,
): Promise<{ trajectory: SkillTrajectory; replay: E2EReplayResult }> {
  const e2eCase = resolveE2eCaseForReplay(sourceE2eCaseId);
  if (!e2eCase) {
    throw new Error(`E2E Case 未在 TD registry 中找到: ${sourceE2eCaseId}`);
  }
  const live = isLiveDecisionReplayEnabled();
  const replay = live ? await runLiveE2eReplay(e2eCase) : await createFixtureE2eReplayService(e2eCase).replay(e2eCase);
  return { trajectory: mapE2eReplayToTrajectory(replay, skill), replay };
}

export { isLiveDecisionReplayEnabled };
