import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminQualityMarkService } from './admin-quality-mark.service';
import { normalizeHardRuleSnapshot } from '../../trips/decision/shared/hard-rule-snapshot.types';
import { assessDrift } from '../../trips/decision/shared/drift-assessment.util';
import { deriveFactsFromMetadata } from '../../trips/decision/shared/fact-derivation.util';

@Injectable()
export class AutoDriftSamplerService {
  private readonly logger = new Logger(AutoDriftSamplerService.name);
  private lastScanAt: Date | null = null;

  constructor(
    @Optional() private readonly prisma?: PrismaService,
    private readonly qualityMarks?: AdminQualityMarkService,
  ) {}

  private enabled(): boolean {
    const v = process.env.AUTO_DRIFT_SAMPLER_ENABLED;
    return v === '1' || v === 'true';
  }

  private getThreshold(): number {
    const v = Number(process.env.AUTO_DRIFT_SAMPLER_THRESHOLD ?? '0.8');
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  }

  private getLookbackMinutes(): number {
    const v = Number(process.env.AUTO_DRIFT_SAMPLER_LOOKBACK_MIN ?? '120');
    const n = Number.isFinite(v) ? Math.max(1, Math.min(24 * 60, Math.round(v))) : 120;
    return n;
  }

  private getBatchLimit(): number {
    const v = Number(process.env.AUTO_DRIFT_SAMPLER_BATCH_LIMIT ?? '200');
    const n = Number.isFinite(v) ? Math.max(10, Math.min(2000, Math.round(v))) : 200;
    return n;
  }

  private getMaxMarksPerRun(): number {
    const v = Number(process.env.AUTO_DRIFT_SAMPLER_MAX_MARKS_PER_RUN ?? '50');
    const n = Number.isFinite(v) ? Math.max(1, Math.min(500, Math.round(v))) : 50;
    return n;
  }

  // Default: every 2 minutes. (Cron syntax: second minute hour day month weekday)
  @Cron('0 */2 * * * *')
  async scanAndMark(): Promise<void> {
    await this.runOnce({ source: 'cron' });
  }

  async runOnce(opts?: { source?: 'cron' | 'manual'; forceSinceIso?: string }) {
    if (!this.enabled()) {
      return { ok: false, skipped: true, reason: 'disabled' };
    }
    if (!this.prisma?.isDbConnected()) {
      this.logger.debug('skip scan: db not connected');
      return { ok: false, skipped: true, reason: 'db_not_connected' };
    }
    if (!this.qualityMarks) {
      this.logger.debug('skip scan: qualityMarks not injected');
      return { ok: false, skipped: true, reason: 'quality_marks_not_injected' };
    }

    const threshold = this.getThreshold();
    const batchLimit = this.getBatchLimit();
    const maxMarks = this.getMaxMarksPerRun();

    const now = new Date();
    const lookbackMin = this.getLookbackMinutes();
    const forcedSince = opts?.forceSinceIso ? new Date(opts.forceSinceIso) : null;
    const since =
      (forcedSince && Number.isFinite(forcedSince.getTime()) ? forcedSince : null) ??
      this.lastScanAt ??
      new Date(now.getTime() - lookbackMin * 60 * 1000);

    try {
      const logs = await this.prisma.decisionLog.findMany({
        where: { timestamp: { gt: since } },
        orderBy: { timestamp: 'asc' },
        take: batchLimit,
        select: {
          id: true,
          tripId: true,
          persona: true,
          action: true,
          timestamp: true,
          explanation: true,
          reasonCodes: true,
          metadata: true,
        },
      });

      if (logs.length === 0) {
        this.lastScanAt = now;
        const out = { ok: true, source: opts?.source ?? 'cron', since: since.toISOString(), rows: 0, marks_created: 0 };
        this.logger.log(`scan done: since=${out.since} rows=0 marks_created=0`);
        return out;
      }

      let created = 0;
      let considered = 0;
      let candidates = 0;
      for (const row of logs) {
        if (created >= maxMarks) break;
        const meta = row.metadata && typeof row.metadata === 'object' ? (row.metadata as any) : {};
        let fact = normalizeHardRuleSnapshot(meta).assertions_triggered;
        if (fact.length === 0) {
          // Backfill mining for legacy logs: derive facts from Pattern A evidence.
          const derived = deriveFactsFromMetadata({
            metadata: meta,
            reasonCodes: row.reasonCodes,
            timestampIso: row.timestamp?.toISOString?.(),
          });
          if (derived.length > 0) {
            fact = derived;
          }
        }
        if (fact.length === 0) continue;
        candidates++;

        const assessed = assessDrift({ fact, explanation: String(row.explanation ?? '') });
        considered++;
        if (!(assessed.drift_label === 'CRITICAL_DRIFT' && assessed.drift_score >= threshold)) continue;

        // Idempotency: avoid spamming duplicates for same target+label when auto_sampled already exists.
        const existing = await this.prisma.adminQualityMark.findMany({
          where: { targetType: 'DECISION_LOG', targetId: row.id, label: 'CRITICAL_DRIFT' },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, meta: true },
        });
        const alreadyAuto = existing.some((m) => (m.meta as any)?.auto_sampled === true);
        if (alreadyAuto) continue;

        const metaPayload = {
          auto_sampled: true,
          drift_score: assessed.drift_score,
          drift_label: assessed.drift_label,
          drift_signals: assessed.drift_signals,
          fact,
          reasoning: {
            explanation: String(row.explanation ?? '').slice(0, 2000),
            reasonCodes: row.reasonCodes,
          },
          source: 'auto_drift_sampler_v1',
        };

        const r = await this.qualityMarks.create({
          actor: null,
          targetType: 'DECISION_LOG',
          targetId: row.id,
          label: 'CRITICAL_DRIFT',
          comment: 'auto-sampled (drift_score>=threshold)',
          meta: metaPayload,
        });
        if (r.ok) created++;
      }

      const out = {
        ok: true,
        source: opts?.source ?? 'cron',
        since: since.toISOString(),
        rows: logs.length,
        fact_candidates: candidates,
        assessed: considered,
        marks_created: created,
        threshold,
        batch_limit: batchLimit,
        max_marks_per_run: maxMarks,
      };
      this.logger.log(
        `scan done: source=${out.source} since=${out.since} rows=${out.rows} fact_candidates=${out.fact_candidates} assessed=${out.assessed} marks_created=${out.marks_created}`,
      );

      // Move scan cursor to newest row timestamp (safer than "now" under clock skew).
      const lastTs = logs[logs.length - 1]?.timestamp;
      this.lastScanAt = lastTs ? new Date(lastTs) : now;
      return out;
    } catch (e: any) {
      this.logger.warn(`scan failed: ${e?.message ?? e}`);
      return { ok: false, skipped: false, reason: 'scan_failed', message: e?.message ?? String(e) };
    }
  }
}

