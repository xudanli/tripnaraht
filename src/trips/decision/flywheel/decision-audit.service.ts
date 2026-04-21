import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import type { AmbiguityReport } from '../../../decision/kernel/ambiguity-resolver';
import type { CalibrationSignal, RiskFeedbackEvent } from '../../../decision/kernel/flywheel-risk-feedback';
import { buildContextKey, type VehicleClass } from './context-utils';
import { updateConsensusLatch, type ConsensusLatchState, type ConsensusSignal } from './consensus-hysteresis';
import type { ShadowDecisionLogPayload } from '../../../decision/kernel/shadow-trace';

export type DecisionAuditContextKey = {
  userId?: string;
  /** Contextual / geographical key, e.g. "Iceland_South" or routeDirectionId string. */
  region?: string;
  /** Normalized spatiotemporal bin key, e.g. "IS:4:SUV". */
  contextKey?: string;
  /** Optional raw attributes used to build contextKey. */
  countryCode?: string;
  month?: number;
  vehicleClass?: VehicleClass;
};

@Injectable()
export class DecisionAuditService {
  private readonly logger = new Logger(DecisionAuditService.name);
  /** Fallback when DB is unavailable or Prisma client not regenerated yet. */
  private readonly consensusLatchByContextKey = new Map<string, ConsensusLatchState>();

  constructor(private readonly prisma: PrismaService) {}

  private consensusLatchDb(): any | undefined {
    return (this.prisma as any).flywheelConsensusLatch;
  }

  private async loadConsensusLatchFromDb(contextKey: string): Promise<ConsensusLatchState | undefined> {
    const db = this.consensusLatchDb();
    if (!db?.findUnique) return undefined;
    if (!this.prisma.isDbConnected?.()) return undefined;
    try {
      const row = await db.findUnique({ where: { contextKey }, select: { state: true } });
      const st = row?.state as ConsensusLatchState | undefined;
      return st && typeof st === 'object' ? st : undefined;
    } catch {
      return undefined;
    }
  }

  private async saveConsensusLatchToDb(contextKey: string, state: ConsensusLatchState): Promise<void> {
    const db = this.consensusLatchDb();
    if (!db?.upsert) return;
    if (!this.prisma.isDbConnected?.()) return;
    try {
      await db.upsert({
        where: { contextKey },
        create: { contextKey, state: state as any },
        update: { state: state as any },
      });
    } catch (e: any) {
      this.logger.warn(`[DecisionAudit] consensus latch persist failed: ${e?.message ?? String(e)}`);
    }
  }

  /**
   * Persist a risk feedback event and its calibration signals into FlywheelOutcome.failureSignals.
   *
   * Notes:
   * - Uses FlywheelOutcome (unique by tripId) as a minimal deployable store, without schema changes.
   * - Stores both user-scoped and region-scoped context for later ambiguity resolution.
   */
  async logRiskFeedback(params: {
    tripId: string;
    userId: string;
    context?: DecisionAuditContextKey;
    event: RiskFeedbackEvent;
    signals: CalibrationSignal[];
    ambiguity?: AmbiguityReport;
  }): Promise<{ id: string | null }> {
    const tripId = String(params.tripId ?? '').trim();
    const userId = String(params.userId ?? '').trim();
    if (!tripId || !userId) {
      this.logger.warn('[DecisionAudit] logRiskFeedback skipped: missing tripId/userId');
      return { id: null };
    }

    const payload = {
      kind: 'RISK_FEEDBACK_V1',
      capturedAt: new Date().toISOString(),
      context: {
        userId,
        region: params.context?.region,
        contextKey:
          params.context?.contextKey ??
          (params.context?.countryCode && params.context?.month && params.context?.vehicleClass
            ? buildContextKey({
                countryCode: params.context.countryCode,
                month: params.context.month,
                vehicleClass: params.context.vehicleClass,
              })
            : undefined),
      },
      ambiguity: params.ambiguity,
      calibrationSignals: params.signals,
      predictionSnapshot: params.event.predicted,
      observationSnapshot: params.event.observed,
      meta: {
        itineraryId: params.event.itineraryId,
        planId: params.event.planId,
        alpha: params.event.alpha,
      },
    };

    try {
      const r = await this.prisma.flywheelOutcome.upsert({
        where: { tripId },
        create: {
          tripId,
          userId,
          failureSignals: payload as any,
        },
        update: {
          userId,
          failureSignals: payload as any,
        },
      });
      return { id: r.id };
    } catch (e: any) {
      this.logger.warn(`[DecisionAudit] logRiskFeedback failed: ${e?.message ?? String(e)}`);
      return { id: null };
    }
  }

  /**
   * Retrieve recent CalibrationSignals, mixing user-specific and region-specific history.
   */
  async getRecentSignals(params: { context?: DecisionAuditContextKey; limit: number }): Promise<(CalibrationSignal & { at?: string; userId?: string; contextKey?: string })[]> {
    const limit = Math.max(1, Math.min(params.limit ?? 50, 200));
    const userId = params.context?.userId?.trim();
    const region = params.context?.region?.trim();
    const contextKey =
      params.context?.contextKey?.trim() ??
      (params.context?.countryCode && params.context?.month && params.context?.vehicleClass
        ? buildContextKey({
            countryCode: params.context.countryCode,
            month: params.context.month,
            vehicleClass: params.context.vehicleClass,
          })
        : undefined);

    // If DB is not connected (common in local/mcp tests), return empty.
    if (!this.prisma.isDbConnected?.() && typeof (this.prisma as any).isDbConnected === 'function') {
      return [];
    }

    const where: any = {};
    const or: any[] = [];
    if (userId) or.push({ userId });
    if (region) {
      // JSON path filter (Postgres jsonb): failureSignals.context.region == region
      or.push({ failureSignals: { path: ['context', 'region'], equals: region } });
    }
    if (contextKey) {
      // JSON path filter: failureSignals.context.contextKey == contextKey
      or.push({ failureSignals: { path: ['context', 'contextKey'], equals: contextKey } });
    }
    if (or.length > 0) where.OR = or;

    try {
      const rows = await this.prisma.flywheelOutcome.findMany({
        where: Object.keys(where).length ? where : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          failureSignals: true,
        },
      });

      const signals: Array<CalibrationSignal & { at?: string; userId?: string; contextKey?: string }> = [];
      for (const r of rows) {
        const fs: any = (r as any).failureSignals;
        const arr = fs?.calibrationSignals;
        const capturedAt = fs?.capturedAt;
        const ctxKey = fs?.context?.contextKey;
        const ctxUserId = fs?.context?.userId ?? (r as any)?.userId;
        if (Array.isArray(arr)) {
          for (const s of arr) {
            if (s && typeof s === 'object') {
              signals.push({ ...(s as CalibrationSignal), at: (s as any).at ?? capturedAt, userId: (s as any).userId ?? ctxUserId, contextKey: (s as any).contextKey ?? ctxKey });
            }
          }
        }
      }
      return signals.slice(0, limit);
    } catch (e: any) {
      this.logger.warn(`[DecisionAudit] getRecentSignals failed: ${e?.message ?? String(e)}`);
      return [];
    }
  }

  /**
   * Shadow Mode: record a would-have-intervened decision without enforcing on the user.
   * Stored as an append-only row for offline analysis and A/B evaluation.
   */
  async logShadowDecision(params: {
    userId: string;
    tripId?: string;
    context?: DecisionAuditContextKey;
    /** v2: reproducible trace + actuator envelope (JSON in `shadow_decisions.decision`) */
    payload: ShadowDecisionLogPayload;
    capturedAt?: string;
  }): Promise<{ id: string | null }> {
    const userId = String(params.userId ?? '').trim();
    if (!userId) {
      this.logger.warn('[DecisionAudit] logShadowDecision skipped: missing userId');
      return { id: null };
    }

    const tripId = params.tripId ? String(params.tripId).trim() : undefined;
    const contextKey =
      params.context?.contextKey ??
      (params.context?.countryCode && params.context?.month && params.context?.vehicleClass
        ? buildContextKey({
            countryCode: params.context.countryCode,
            month: params.context.month,
            vehicleClass: params.context.vehicleClass,
          })
        : undefined);

    // If DB is not connected (common in local/mcp tests), no-op.
    if (!this.prisma.isDbConnected?.() && typeof (this.prisma as any).isDbConnected === 'function') {
      return { id: null };
    }

    try {
      const shadowDecision = (this.prisma as any).shadowDecision;
      if (!shadowDecision?.create) {
        this.logger.warn('[DecisionAudit] logShadowDecision skipped: shadowDecision model not available');
        return { id: null };
      }
      const r = await shadowDecision.create({
        data: {
          userId,
          tripId: tripId || undefined,
          region: params.context?.region?.trim(),
          contextKey: contextKey?.trim(),
          capturedAt: params.capturedAt ? new Date(params.capturedAt) : undefined,
          decision: params.payload as any,
        },
        select: { id: true },
      });
      return { id: r.id };
    } catch (e: any) {
      this.logger.warn(`[DecisionAudit] logShadowDecision failed: ${e?.message ?? String(e)}`);
      return { id: null };
    }
  }

  /**
   * Distributed consensus with hysteresis (cool-down) to prevent emergency churning.
   * Persists latch state in `flywheel_consensus_latches` (Prisma). Falls back to in-memory map when DB is unavailable.
   */
  async updateConsensusEmergency(params: {
    contextKey: string;
    signals: ConsensusSignal[];
    nowMs?: number;
  }): Promise<{ isEmergency: boolean; reason?: string; state: ConsensusLatchState }> {
    const key = String(params.contextKey ?? '').trim();
    const nowMs = params.nowMs ?? Date.now();
    const fromDb = await this.loadConsensusLatchFromDb(key);
    const prev = fromDb ?? this.consensusLatchByContextKey.get(key);
    const out = updateConsensusLatch(prev, params.signals, {
      contextKey: key,
      nowMs,
      enterWindowHours: 6,
      enterMinUsers: 3,
      exitQuietHours: 12,
      exitMinDecreaseUsers: 2,
    });
    this.consensusLatchByContextKey.set(key, out.state);
    await this.saveConsensusLatchToDb(key, out.state);
    return { isEmergency: out.state.isEmergency, reason: out.reason, state: out.state };
  }
}

