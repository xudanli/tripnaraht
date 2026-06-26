import { Injectable, Logger, Optional } from '@nestjs/common';
import { UserProfileLearningService } from './user-profile-learning.service';
import { DecisionDnaComplianceService } from '../memory/governance/decision-dna-compliance.service';

export type PreferenceEvolutionReason =
  | 'NEGOTIATION_CONFIRMED'
  | 'NEGOTIATION_ROLLED_BACK'
  | 'TREK_VIBE_CONFIRMED'
  | 'TREK_READINESS_ACK'
  | 'TREK_POST_RATING_FIVE_STAR'
  | 'TASK_CHAIN_CONFIRMED'
  | 'TASK_CHAIN_ROLLED_BACK'
  | 'TASK_CHAIN_TIMEOUT'
  | 'TREK_PHYSICAL_FAILURE'
  | 'SOVEREIGN_FORCE_LOCK';

const DEFAULT_THROTTLE_MS = 60_000;

function key(userId: string, tripId: string | null | undefined): string {
  return `${userId}:${tripId ?? 'unknown'}`;
}

/**
 * Asynchronous, event-driven preference evolution. Designed to be “invisible background logic”:
 * - never blocks API responses
 * - throttled per (user, trip)
 * - singleflight per user to avoid concurrent writes clobbering JSON preferences
 * - PIPL: implicit signals gated by DecisionDnaComplianceService
 */
@Injectable()
export class PreferenceEvolutionService {
  private readonly logger = new Logger(PreferenceEvolutionService.name);
  private readonly lastRunMs = new Map<string, number>();
  private readonly inFlightByUser = new Map<string, Promise<void>>();

  constructor(
    @Optional() private readonly learner?: UserProfileLearningService,
    @Optional() private readonly compliance?: DecisionDnaComplianceService,
  ) {}

  scheduleDecisionDnaSync(params: {
    userId: string | null | undefined;
    tripId?: string | null;
    reason: PreferenceEvolutionReason;
    throttleMs?: number;
  }): void {
    const uid = params.userId != null ? String(params.userId).trim() : '';
    if (!uid || !this.learner) return;

    const k = `${key(uid, params.tripId)}:${params.reason}`;
    const now = Date.now();
    const throttle = typeof params.throttleMs === 'number' && Number.isFinite(params.throttleMs) ? Math.max(1_000, params.throttleMs) : DEFAULT_THROTTLE_MS;
    const last = this.lastRunMs.get(k) ?? 0;
    if (now - last < throttle) return;

    this.lastRunMs.set(k, now);

    setImmediate(() => {
      void this.runSingleflight(uid, params.reason);
    });
  }

  private runSingleflight(userId: string, reason: PreferenceEvolutionReason): Promise<void> {
    const existing = this.inFlightByUser.get(userId);
    if (existing) return existing;

    const p = (async () => {
      try {
        if (this.compliance) {
          const gate = await this.compliance.evaluateSync({ userId, reason });
          this.compliance.recordAudit({
            userId,
            reason,
            signalSource: gate.signalSource,
            tier: gate.tier,
            allowed: gate.allowed,
            blockedReason: gate.blockedReason,
          });
          if (!gate.allowed) {
            this.logger.debug(
              `Decision DNA sync skipped (${reason}): ${gate.blockedReason ?? 'blocked'}`,
            );
            return;
          }
        }

        await this.learner!.syncPreferenceToProfile({ userId, reason });
      } catch (e) {
        this.logger.warn(`Decision DNA sync failed (${reason}): ${(e as Error)?.message ?? e}`);
      } finally {
        this.inFlightByUser.delete(userId);
      }
    })();

    this.inFlightByUser.set(userId, p);
    return p;
  }
}
