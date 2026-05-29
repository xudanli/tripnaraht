/**
 * Live E2E replay：真实 TripDecisionEngineService + 内存日志缓存（供 E2EReplayService.queryLogs）
 */
import { NestFactory } from '@nestjs/core';
import { E2EReplayService } from '../../../../trips/decision/evaluation/e2e-replay.service';
import type {
  E2EActualResult,
  E2ECase,
  E2EReplayResult,
} from '../../../../trips/decision/evaluation/e2e-case.types';
import { analyzeDiff } from '../../../../trips/decision/evaluation/e2e-assertions';
import { buildDecisionTraceSummary } from '../../../../trips/decision/evaluation/replay-trace-contract';
import { TripDecisionEngineService } from '../../../../trips/decision/trip-decision-engine.service';
import type { DecisionLogStorageService } from '../../../../trips/decision/services/decision-log-storage.service';
import type { DecisionLogEntry } from '../../../../trips/decision/shared/decision-result.types';
import type { DecisionRunLog } from '../../../../trips/decision/decision-log';
import type { ActivityCandidate, TripWorldState } from '../../../../trips/decision/world-model';
import { DecisionReplayLiveModule } from '../decision-replay-live.module';
import { applyPrismaTripIdToWorldState } from '../../../../trips/execution-closure-persistence/apply-prisma-trip-id-to-world-state';

function strategyLogsToEntries(log: DecisionRunLog): DecisionLogEntry[] {
  const rows = log.strategyLogs ?? [];
  return rows.map((row) => ({
    persona: row.persona,
    action: row.action,
    explanation: row.explanation,
    reasonCodes: row.reasonCodes ?? [],
    evidenceRefs: [] as string[],
    timestamp: row.timestamp ?? new Date().toISOString(),
    decisionSource: 'STRATEGY' as DecisionLogEntry['decisionSource'],
    decisionStage: 'STRATEGY' as DecisionLogEntry['decisionStage'],
  }));
}

class InMemoryDecisionLogStorage {
  private readonly byKey = new Map<string, DecisionLogEntry[]>();

  set(key: string, logs: DecisionLogEntry[]): void {
    this.byKey.set(key, logs);
  }

  async queryLogs(filter: { requestId?: string; tripId?: string; limit?: number }): Promise<DecisionLogEntry[]> {
    const key = filter.requestId ?? filter.tripId ?? '';
    const logs = this.byKey.get(key) ?? [];
    const limit = filter.limit ?? 1000;
    return logs.slice(0, limit);
  }
}

/** 与 capture-golden-with-engine-dso 一致：为 live 引擎提供候选池 */
export function buildLiveReplayWorldState(testCase: E2ECase): TripWorldState {
  const startDate = new Date(new Date().getFullYear(), (testCase.input.season ?? 7) - 1, 1)
    .toISOString()
    .slice(0, 10);
  const durationDays = Math.max(1, testCase.expected.finalState.planDays ?? 7);
  const mkDate = (i: number) => {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  };

  const candidatesByDate: Record<string, ActivityCandidate[]> = {};
  for (let i = 0; i < durationDays; i++) {
    const date = mkDate(i);
    candidatesByDate[date] = Array.from({ length: 6 }).map((_, idx) => ({
      id: `cand-${testCase.id}-${i}-${idx}`,
      name: { en: `Candidate ${i}-${idx}`, zh: `候选 ${i}-${idx}` },
      type: 'poi' as const,
      location: {
        point: { lat: 64.0 + i * 0.02 + idx * 0.001, lng: -21.0 - idx * 0.02 },
      },
      durationMin: 60 + idx * 15,
      cost: { amount: 20 + idx * 5, currency: 'USD' },
      intentTags: testCase.input.userProfile.preferredRouteTypes ?? [],
      qualityScore: 0.6 + idx * 0.05,
    })) as unknown as ActivityCandidate[];
  }

  const world = {
    context: {
      destination: testCase.input.countryCode,
      startDate,
      durationDays,
      preferences: {
        intents: Object.fromEntries(
          (testCase.input.userProfile.preferredRouteTypes ?? []).map((t) => [t, 0.8]),
        ),
        pace:
          testCase.input.userProfile.pacePreference === 'SLOW'
            ? 'relaxed'
            : testCase.input.userProfile.pacePreference === 'FAST'
              ? 'intense'
              : 'moderate',
        riskTolerance: (testCase.input.userProfile.riskTolerance ?? 'MEDIUM').toLowerCase(),
      },
    },
    candidatesByDate,
    signals: { lastUpdatedAt: new Date().toISOString() },
  } as TripWorldState;

  if (testCase.input.tripId) {
    applyPrismaTripIdToWorldState(world, testCase.input.tripId);
  }
  return world;
}

export function isLiveDecisionReplayEnabled(): boolean {
  const v = process.env.SKILL_EVOLVER_LIVE_DECISION_REPLAY?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

let liveAppPromise: Promise<{
  replayService: E2EReplayService;
  close: () => Promise<void>;
}> | null = null;

export async function getLiveE2eReplayService(): Promise<{
  replayService: E2EReplayService;
  close: () => Promise<void>;
}> {
  if (!liveAppPromise) {
    liveAppPromise = (async () => {
      const logStorage = new InMemoryDecisionLogStorage();
      const app = await NestFactory.createApplicationContext(DecisionReplayLiveModule, {
        logger: ['error', 'warn'],
      });
      const engine = app.get(TripDecisionEngineService);
      const wrappedEngine = {
        generatePlan: async (worldState: Parameters<TripDecisionEngineService['generatePlan']>[0], requestId: string) => {
          const result = await engine.generatePlan(worldState, requestId);
          const entries = strategyLogsToEntries(result.log);
          logStorage.set(requestId, entries);
          const tripId = result.log.inputDigest?.tripId;
          if (tripId) logStorage.set(tripId, entries);
          return result;
        },
      } as unknown as TripDecisionEngineService;

      const replayService = new E2EReplayService(
        wrappedEngine,
        logStorage as unknown as DecisionLogStorageService,
      );

      return {
        replayService,
        close: async () => {
          await app.close();
          liveAppPromise = null;
        },
      };
    })();
  }
  return liveAppPromise;
}

export async function runLiveE2eReplay(testCase: E2ECase): Promise<E2EReplayResult> {
  const startTime = Date.now();
  const { replayService } = await getLiveE2eReplayService();
  const engine = (replayService as unknown as { decisionEngine: TripDecisionEngineService })
    .decisionEngine;
  const logStorage = (replayService as unknown as { logStorage: InMemoryDecisionLogStorage })
    .logStorage;

  try {
    const worldState = buildLiveReplayWorldState(testCase);
    const requestId = `e2e-live-${testCase.id}`;
    const result = await engine.generatePlan(worldState, requestId);
    const tripId = result.log.inputDigest?.tripId;
    const logs = await logStorage.queryLogs(
      tripId ? { tripId, limit: 1000 } : { requestId, limit: 1000 },
    );

    const actual: E2EActualResult = {
      routeDirectionId: result.log.routeDirection?.selected?.uuid,
      decisionRunLog: result.log as E2EActualResult['decisionRunLog'],
      logs: logs
        .map((log) => ({
          persona: log.persona,
          action: log.action,
          explanation: log.explanation,
          reasonCodes: log.reasonCodes,
          evidenceRefs: log.evidenceRefs,
          timestamp: log.timestamp,
          decisionSource: log.decisionSource,
          decisionStage: log.decisionStage,
          metadata: log.metadata,
        }))
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
      finalPlan: {
        days: result.plan.days?.length ?? 0,
        allowed:
          result.log.strategyLogs && result.log.strategyLogs.length > 0
            ? result.log.strategyLogs[result.log.strategyLogs.length - 1].action !== 'REJECT'
            : true,
      },
    };
    actual.traceSummary = buildDecisionTraceSummary(actual.logs);
    const diff = analyzeDiff(testCase.expected, actual);
    const passed = !diff.hasDiff;

    return {
      case: testCase,
      actual,
      diff,
      passed,
      executionTime: Date.now() - startTime,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      case: testCase,
      actual: { logs: [] },
      diff: { hasDiff: true, finalStateDiff: `执行失败: ${message}` },
      passed: false,
      executionTime: Date.now() - startTime,
    };
  }
}

export async function closeLiveE2eReplayContext(): Promise<void> {
  if (liveAppPromise) {
    const ctx = await liveAppPromise;
    await ctx.close();
  }
}
