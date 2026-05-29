import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { TripObservationAction } from '../../../trips/road/trip-action.types';
import type { DecisionState, ObservationRecommendation } from '../decision-state.types';
import { rankObservationActionsFromSignals } from '../voi-observation.util';
import type {
  ObservationHarnessAuditEntry,
  ObservationHarnessOutcome,
  ObservationExecutionResult,
  ObservationToolExecutor,
} from './observation-harness.types';
import { DefaultObservationToolExecutor } from './observation-tool-executors';

export const OBSERVATION_TOOL_EXECUTOR = Symbol('OBSERVATION_TOOL_EXECUTOR');

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

/**
 * RESEARCH 阶段观测闭环：读取 OptimizationHints 或基于当前 DSO 的 VOI 排名，
 * **并行**执行观测工具链（单动作 `OBSERVATION_TIMEOUT_MS` 超时则回退弱证据，不阻塞整段 RESEARCH），
 * 产出 environment / researchData / excludePoiIds / passabilityEvidence。
 */
@Injectable()
export class ObservationHarnessService {
  private readonly logger = new Logger(ObservationHarnessService.name);

  constructor(
    @Optional()
    @Inject(OBSERVATION_TOOL_EXECUTOR)
    private readonly injectedExecutor?: ObservationToolExecutor,
  ) {}

  private get executor(): ObservationToolExecutor {
    return this.injectedExecutor ?? new DefaultObservationToolExecutor();
  }

  private readonly minVoiScore = (() => {
    const raw = process.env.OBSERVATION_VOI_THRESHOLD?.trim();
    if (!raw) return -0.25;
    const n = Number(raw);
    return Number.isFinite(n) ? n : -0.25;
  })();

  private readonly maxActions = (() => {
    const raw = process.env.OBSERVATION_MAX_ACTIONS?.trim();
    const n = raw ? Number(raw) : 2;
    return Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : 2;
  })();

  /** 单观测 HTTP/LLM 上限；允许低至 ~200ms 供集成测试，生产建议 3000–5000。 */
  private getObservationTimeoutMs(): number {
    const raw = process.env.OBSERVATION_TIMEOUT_MS?.trim();
    const n = raw ? Number(raw) : 4500;
    if (!Number.isFinite(n)) return 4500;
    return Math.min(12000, Math.max(50, Math.floor(n)));
  }

  private buildCandidates(dso: DecisionState): ObservationRecommendation[] {
    const fromHints = dso.optimizationHints?.observationRecommendations;
    if (fromHints && fromHints.length > 0) {
      return [...fromHints].sort((a, b) => b.voiScore - a.voiScore);
    }
    const env = dso.environmentState ?? {};
    const weatherRisk01 = typeof env.weatherRisk === 'number' ? clamp01(env.weatherRisk) : 0;
    const entropy01 = dso.uncertaintyProfile?.entropy01;
    const utilityBefore = dso.optimizationHints?.expectedUtility ?? 0.55;
    const dest = dso.userIntent?.destination;
    return rankObservationActionsFromSignals({
      utilityBefore,
      entropy01,
      weatherRisk01,
      fragilePoiIds: (dso.userIntent?.mustIncludePoiIds ?? []).slice(0, 4),
      geo:
        dest && typeof dest === 'object' && 'lat' in dest && 'lng' in dest
          ? { lat: (dest as { lat: number; lng: number }).lat, lng: (dest as { lat: number; lng: number }).lng }
          : undefined,
    });
  }

  private executeObservationWithTimeout(
    rec: ObservationRecommendation,
    dso: DecisionState,
    timeoutMs: number,
  ): Promise<{
    rec: ObservationRecommendation;
    execution: ObservationExecutionResult;
    timedOut?: boolean;
  }> {
    const action = rec.action as TripObservationAction;
    return new Promise(resolve => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve({
          rec,
          execution: {
            evidenceKind: 'stub',
            evidenceWeight: 0,
            summary: 'OBSERVATION_TIMEOUT',
          },
          timedOut: true,
        });
      }, timeoutMs);

      this.executor
        .execute(action, dso)
        .then(execution => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({ rec, execution });
        })
        .catch((e: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`[ObservationHarness] execute failed: ${msg}`);
          resolve({
            rec,
            execution: {
              evidenceKind: 'stub',
              evidenceWeight: 0,
              summary: `EXECUTION_ERROR:${msg.slice(0, 200)}`,
            },
          });
        });
    });
  }

  /**
   * 对高于 VOI 阈值的观测建议 **并行** 执行；多观测 passability 分歧大时下调 evidenceWeight（认识论噪声）。
   */
  async handleObservations(dso: DecisionState): Promise<ObservationHarnessOutcome> {
    const candidates = this.buildCandidates(dso);
    const picked = candidates.filter(c => c.voiScore >= this.minVoiScore).slice(0, this.maxActions);

    if (picked.length === 0) {
      return {
        researchDataPatch: {},
        audit: [],
        executedActions: [],
      };
    }

    const rows = await Promise.all(
      picked.map(rec => this.executeObservationWithTimeout(rec, dso, this.getObservationTimeoutMs())),
    );

    let adjusted = rows.map(r => ({
      rec: r.rec,
      execution: { ...r.execution },
      timedOut: r.timedOut,
    }));

    const passVals = adjusted
      .map(r => r.execution.passability01)
      .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
    let crossSpread = 0;
    if (passVals.length >= 2) {
      crossSpread = Math.max(...passVals) - Math.min(...passVals);
      if (crossSpread >= 0.45) {
        adjusted = adjusted.map(r =>
          typeof r.execution.passability01 === 'number'
            ? {
                ...r,
                execution: {
                  ...r.execution,
                  evidenceWeight: clamp01((r.execution.evidenceWeight ?? 0) * 0.45),
                  evidenceContradiction: true,
                  summary: `${r.execution.summary ?? ''} [CROSS_OBSERVATION_SPREAD=${crossSpread.toFixed(2)}]`.trim(),
                },
              }
            : r,
        );
      }
    }

    const audit: ObservationHarnessAuditEntry[] = [];
    let bestPass: { passability01: number; evidenceWeight: number } | undefined;
    const excluded = new Set<string>();

    for (const row of adjusted) {
      audit.push({
        recommendation: row.rec,
        execution: row.execution,
        at: new Date().toISOString(),
      });

      if (typeof row.execution.passability01 === 'number' && Number.isFinite(row.execution.passability01)) {
        const w = clamp01(row.execution.evidenceWeight);
        if (!bestPass || w >= bestPass.evidenceWeight) {
          bestPass = { passability01: clamp01(row.execution.passability01), evidenceWeight: w };
        }
      }

      if (row.execution.routeSegmentInfeasible && row.execution.affectedPoiIds?.length) {
        for (const id of row.execution.affectedPoiIds) {
          if (id) excluded.add(String(id).trim());
        }
      }
    }

    // 仅成功执行（非超时/执行器错误）记入 executedActions，供编排层统计
    const executedDedup: TripObservationAction[] = [];
    const seen = new Set<string>();
    for (const row of adjusted) {
      const action = row.rec.action as TripObservationAction;
      const key = JSON.stringify(action);
      if (seen.has(key)) continue;
      seen.add(key);
      const isTimeout = row.timedOut || row.execution.summary === 'OBSERVATION_TIMEOUT';
      const isErr = (row.execution.summary ?? '').startsWith('EXECUTION_ERROR');
      if (!isTimeout && !isErr) {
        executedDedup.push(action);
      }
    }

    const excludedPoiIds = excluded.size > 0 ? [...excluded] : undefined;

    const environmentPatch =
      bestPass !== undefined
        ? {
            roadConditions: {
              ...(typeof dso.environmentState?.roadConditions === 'object' &&
              dso.environmentState?.roadConditions !== null
                ? (dso.environmentState.roadConditions as Record<string, unknown>)
                : {}),
              _aggregatePassability: bestPass.passability01,
              _observationHarnessAt: new Date().toISOString(),
            },
            accessibilityScore:
              typeof dso.environmentState?.accessibilityScore === 'number'
                ? Math.min(dso.environmentState.accessibilityScore, bestPass.passability01)
                : bestPass.passability01,
          }
        : undefined;

    const suggestDilemmaElicitation =
      crossSpread >= 0.45
        ? {
            reason: 'EVIDENCE_CONTRADICTION' as const,
            crossSpread,
            hint:
              'Multiple observations disagree on passability; prefer asking the user to choose risk tolerance before committing.',
          }
        : undefined;

    const researchDataPatch: Record<string, unknown> = {
      observationHarness: {
        minVoiScore: this.minVoiScore,
        maxActions: this.maxActions,
        observationTimeoutMs: this.getObservationTimeoutMs(),
        parallel: true,
        audit,
        excludedPoiIds: excludedPoiIds ?? [],
        passabilityEvidence: bestPass,
        suggestDilemmaElicitation,
      },
    };

    return {
      researchDataPatch,
      environmentPatch,
      excludedPoiIds,
      passabilityEvidence: bestPass,
      audit,
      executedActions: executedDedup,
    };
  }
}
