/**
 * Controllable fake Decision Engine HTTP server for E1 fault-injection tests.
 */

import * as http from 'node:http';
import type {
  OptimizationShadowEvent,
  ResultSummary,
} from '../../observability/shadow-divergence.types';

type ApiBody = {
  success: boolean;
  data?: unknown;
  error?: { code?: string; message?: string };
};

export interface FakeInstanceBehavior {
  /** Shadow appears after N list-event polls (0 = immediate). */
  deferShadowPolls?: number;
  eligibleForStrategyComparison?: boolean;
  divergenceTypes?: string[];
  authorityWinner?: string;
  shadowWinner?: string;
  /** Authority HTTP status override. */
  authorityStatus?: number;
  authorityError?: string;
  /** Materialize HTTP status override. */
  materializeStatus?: number;
  materializeError?: string;
  /** Skip creating review case (SAME_WINNER skip). */
  materializeSkipReason?: string;
}

export interface FakeServerMetrics {
  authorityRequestCount: number;
  materializeRequestCount: number;
  shadowListPollCount: number;
}

function resultSummary(winner: string): ResultSummary {
  return {
    strategyId: 'test',
    strategyVersion: 'v1',
    success: true,
    timedOut: false,
    selectedCandidateId: winner,
    feasibilityStatus: 'FEASIBLE',
    terminationReason: 'OPTIMAL',
    hasIncumbent: true,
    elapsedMs: 12,
    rankedTop3: [winner],
    hardViolation: false,
    postValidationRejected: false,
  };
}

export function buildFakeShadowEvent(input: {
  comparisonId: string;
  decisionRunId: string;
  tripId: string;
  eligible: boolean;
  divergenceTypes: string[];
  authorityWinner: string;
  shadowWinner: string;
}): OptimizationShadowEvent {
  const types = input.divergenceTypes as OptimizationShadowEvent['divergence']['types'];
  return {
    schemaId: 'tripnara.optimization_shadow_event@v1',
    comparisonId: input.comparisonId,
    tripId: input.tripId,
    decisionRunId: input.decisionRunId,
    problemId: input.decisionRunId,
    snapshotId: 'snap-test',
    runtimeMode: 'SHADOW',
    authorityStrategyId: 'decision-core-finalize',
    shadowStrategyId: 'cp-sat-lexicographic',
    inputFingerprint: {
      snapshotId: 'snap-test',
      snapshotHash: 'hash-snap',
      candidateSetHash: 'hash-cset',
      candidateCount: 2,
      constraintReportHash: 'hash-con',
      constraintReportVersion: 'v1',
      objectiveRegistryVersion: 'v1',
      objectiveConfigHash: 'hash-obj',
    },
    inputConsistent: !types.includes('INPUT_MISMATCH'),
    eligibleForStrategyComparison: input.eligible,
    authorityResult: resultSummary(input.authorityWinner),
    shadowResult: resultSummary(input.shadowWinner),
    divergence: {
      diverged: !types.includes('SAME_WINNER'),
      sameWinner: types.includes('SAME_WINNER'),
      types,
      severity: types.includes('INPUT_MISMATCH') ? 'CRITICAL' : 'LOW',
      explainability: ['test'],
      stageTraceComplete: true,
    },
    createdAt: new Date().toISOString(),
  };
}

export class BenchmarkFakeHttpServer {
  readonly metrics: FakeServerMetrics = {
    authorityRequestCount: 0,
    materializeRequestCount: 0,
    shadowListPollCount: 0,
  };

  private server?: http.Server;
  private baseUrl = '';
  private readonly behaviors = new Map<string, FakeInstanceBehavior>();
  private readonly shadowsByRunId = new Map<string, OptimizationShadowEvent>();
  private readonly pollCountByRunId = new Map<string, number>();
  private readonly reviewCaseByComparison = new Map<string, string>();

  registerInstance(instanceId: string, behavior: FakeInstanceBehavior): void {
    this.behaviors.set(instanceId, behavior);
  }

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = this.server.address();
    if (!addr || typeof addr === 'string') throw new Error('Fake server failed to bind');
    this.baseUrl = `http://127.0.0.1:${addr.port}/api`;
    return this.baseUrl;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (!this.server) return resolve();
      this.server.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = undefined;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  getReviewCaseId(comparisonId: string): string | undefined {
    return this.reviewCaseByComparison.get(comparisonId);
  }

  /** Register a pollable shadow event for resume tests that skip live authority HTTP. */
  registerShadowForDecisionRun(input: {
    instanceId: string;
    decisionRunId: string;
    tripId: string;
  }): OptimizationShadowEvent {
    const behavior = this.behaviors.get(input.instanceId) ?? {};
    const shadow = buildFakeShadowEvent({
      comparisonId: `cmp_${input.decisionRunId.slice(0, 12)}`,
      decisionRunId: input.decisionRunId,
      tripId: input.tripId,
      eligible: behavior.eligibleForStrategyComparison ?? true,
      divergenceTypes: behavior.divergenceTypes ?? ['DIFFERENT_WINNER'],
      authorityWinner: behavior.authorityWinner ?? 'cand-a',
      shadowWinner: behavior.shadowWinner ?? 'cand-b',
    });
    this.shadowsByRunId.set(input.decisionRunId, shadow);
    this.pollCountByRunId.set(input.decisionRunId, 0);
    return shadow;
  }

  private behaviorFor(headers: http.IncomingHttpHeaders): FakeInstanceBehavior {
    const scenarioId = String(headers['x-decision-scenario-id'] ?? 'default');
    return this.behaviors.get(scenarioId) ?? {};
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    const path = url.pathname;
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const rawBody = Buffer.concat(chunks).toString('utf8');
    let body: Record<string, unknown> = {};
    try {
      body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }

    const send = (status: number, payload: ApiBody) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method === 'POST' && path.endsWith('/canonical-plan-selection')) {
      this.metrics.authorityRequestCount += 1;
      const behavior = this.behaviorFor(req.headers);
      if (behavior.authorityStatus && behavior.authorityStatus >= 400) {
        send(behavior.authorityStatus, {
          success: false,
          error: { message: behavior.authorityError ?? 'authority failed' },
        });
        return;
      }

      const runId = String(req.headers['x-decision-run-id'] ?? body.problemId ?? 'run');
      const scenarioId = String(req.headers['x-decision-scenario-id'] ?? 'default');
      const tripId = String(body.tripId ?? 'trip');
      const authorityWinner = behavior.authorityWinner ?? 'cand-a';
      const shadowWinner = behavior.shadowWinner ?? 'cand-b';
      const comparisonId = `cmp_${runId.slice(0, 12)}`;
      const stagingShadow = body.stagingShadowOptions as
        | { inputMismatch?: boolean }
        | undefined;
      let divergenceTypes = behavior.divergenceTypes ?? ['DIFFERENT_WINNER'];
      let eligible = behavior.eligibleForStrategyComparison ?? true;
      if (stagingShadow?.inputMismatch) {
        divergenceTypes = ['INPUT_MISMATCH'];
        eligible = false;
      }

      const shadow = buildFakeShadowEvent({
        comparisonId,
        decisionRunId: runId,
        tripId,
        eligible,
        divergenceTypes,
        authorityWinner,
        shadowWinner,
      });

      const defer = behavior.deferShadowPolls ?? 0;
      if (defer <= 0) {
        this.shadowsByRunId.set(runId, shadow);
      } else {
        this.pollCountByRunId.set(runId, 0);
        this.shadowsByRunId.set(runId, shadow);
      }

      send(200, {
        success: true,
        data: {
          record: { selectedCandidateId: authorityWinner },
          optimizationShadow: defer <= 0 ? shadow : undefined,
        },
      });
      return;
    }

    if (req.method === 'GET' && path.includes('/shadow-observability/events/')) {
      const comparisonId = decodeURIComponent(path.split('/').pop() ?? '');
      for (const ev of this.shadowsByRunId.values()) {
        if (ev.comparisonId === comparisonId) {
          send(200, { success: true, data: ev });
          return;
        }
      }
      send(404, { success: false, error: { message: 'not found' } });
      return;
    }

    if (req.method === 'GET' && path.endsWith('/shadow-observability/events')) {
      this.metrics.shadowListPollCount += 1;
      const runId = url.searchParams.get('decisionRunId') ?? '';
      const behavior = [...this.behaviors.values()][0] ?? {};
      const defer = behavior.deferShadowPolls ?? 0;
      const polls = (this.pollCountByRunId.get(runId) ?? 0) + 1;
      this.pollCountByRunId.set(runId, polls);

      const shadow = this.shadowsByRunId.get(runId);
      if (shadow && polls > defer) {
        send(200, { success: true, data: { events: [shadow] } });
        return;
      }
      send(200, { success: true, data: { events: [] } });
      return;
    }

    if (req.method === 'POST' && path.endsWith('/shadow-reviews/materialize')) {
      this.metrics.materializeRequestCount += 1;
      const behavior = [...this.behaviors.values()][0] ?? {};
      if (behavior.materializeStatus && behavior.materializeStatus >= 400) {
        send(behavior.materializeStatus, {
          success: false,
          error: { message: behavior.materializeError ?? 'materialize failed' },
        });
        return;
      }

      const comparisonIds = (body.comparisonIds as string[]) ?? [];
      const comparisonId = comparisonIds[0];
      if (!comparisonId) {
        send(400, { success: false, error: { message: 'comparisonIds required' } });
        return;
      }

      if (behavior.materializeSkipReason) {
        send(200, {
          success: true,
          data: {
            created: 0,
            alreadyExists: 0,
            materialized: [],
            skipped: [{ comparisonId, reason: behavior.materializeSkipReason }],
          },
        });
        return;
      }

      if (this.reviewCaseByComparison.has(comparisonId)) {
        send(200, {
          success: true,
          data: {
            created: 0,
            alreadyExists: 1,
            materialized: [],
            skipped: [],
          },
        });
        return;
      }

      const reviewCaseId = `rc_${comparisonId}`;
      this.reviewCaseByComparison.set(comparisonId, reviewCaseId);
      send(200, {
        success: true,
        data: {
          created: 1,
          alreadyExists: 0,
          materialized: [{ reviewCaseId, comparisonId }],
          skipped: [],
        },
      });
      return;
    }

    if (req.method === 'GET' && path.endsWith('/shadow-reviews/queue')) {
      const items = [...this.reviewCaseByComparison.entries()].map(([comparisonId, reviewCaseId]) => ({
        reviewCaseId,
        comparisonId,
      }));
      send(200, { success: true, data: { items } });
      return;
    }

    send(404, { success: false, error: { message: `unhandled ${req.method} ${path}` } });
  }
}
