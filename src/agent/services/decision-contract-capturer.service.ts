import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeHardRuleSnapshot, type HardRuleFact } from '../../trips/decision/shared/hard-rule-snapshot.types';
import { deriveFactsFromMetadata } from '../../trips/decision/shared/fact-derivation.util';

@Injectable()
export class DecisionContractCapturerService {
  private readonly logger = new Logger(DecisionContractCapturerService.name);

  constructor(@Optional() private readonly prisma?: PrismaService) {}

  async captureFeasibilitySnapshot(params: {
    tripId: string;
    lookbackMinutes?: number;
    take?: number;
  }): Promise<{
    feasible: boolean;
    hard_violation_count: number;
    violated_rules: Array<{ rule_id: string; severity: 'HARD' | 'SOFT' }>;
    facts: HardRuleFact[];
    evidence_refs: string[];
  } | null> {
    if (!this.prisma?.isDbConnected()) return null;
    const lookback = Math.max(1, Math.min(24 * 60, Math.round(Number(params.lookbackMinutes ?? 60))));
    const take = Math.max(1, Math.min(200, Math.round(Number(params.take ?? 50))));
    const since = new Date(Date.now() - lookback * 60 * 1000);

    try {
      const rows = await this.prisma.decisionLog.findMany({
        where: {
          tripId: params.tripId,
          timestamp: { gte: since },
        },
        orderBy: { timestamp: 'desc' },
        take,
        select: {
          id: true,
          timestamp: true,
          reasonCodes: true,
          metadata: true,
        },
      });
      if (rows.length === 0) return null;

      const facts: HardRuleFact[] = [];
      const evidence_refs: string[] = [];
      for (const r of rows) {
        evidence_refs.push(String(r.id));
        const meta = r.metadata && typeof r.metadata === 'object' ? (r.metadata as any) : {};
        const fromFacts = normalizeHardRuleSnapshot(meta).assertions_triggered;
        if (fromFacts.length > 0) {
          facts.push(...fromFacts);
          continue;
        }
        const derived = deriveFactsFromMetadata({
          metadata: meta,
          reasonCodes: Array.isArray(r.reasonCodes) ? r.reasonCodes : [],
          timestampIso: r.timestamp?.toISOString?.(),
        });
        if (derived.length > 0) facts.push(...derived);
      }

      const hardViolated = facts.filter((f) => String(f.severity ?? 'HARD').toUpperCase() === 'HARD' && f.is_violated);
      const violated_rules = hardViolated.map((f) => ({ rule_id: f.rule_id, severity: 'HARD' as const }));
      const feasible = hardViolated.length === 0;

      return {
        feasible,
        hard_violation_count: hardViolated.length,
        violated_rules,
        facts,
        evidence_refs,
      };
    } catch (e: any) {
      this.logger.debug(`captureFeasibilitySnapshot skipped: ${e?.message ?? String(e)}`);
      return null;
    }
  }
}

