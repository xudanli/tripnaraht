import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const DEFAULT_ROLLBACK_LOOKBACK = 25;
const MIN_SAMPLES_FOR_BIAS = 3;
const DOMINANCE_RATIO = 0.5;
const MIN_DOMINANT_COUNT = 2;
/** Extra effort delta (0–1 scale) when user repeatedly rolls back the same alternative across trips. */
export const GLOBAL_ROLLBACK_BIAS_EFFORT = 0.15;
const DNA_MIN_CONFIDENCE_FOR_BIAS = 0.4;

/**
 * Cross-trip preference hints from append-only ROLLBACK history (userId-scoped).
 * v0: single dominant alternative_id in recent rollbacks → effort penalty on that option in negotiation.
 */
@Injectable()
export class UserPreferenceLearningService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  private async getBiasFromDecisionDna(
    userId: string,
    alternativeId: string,
  ): Promise<number | null> {
    if (!this.prisma) return null;
    try {
      const row = await this.prisma.userProfile.findUnique({
        where: { userId },
        select: { preferences: true },
      });
      const prefs = (row?.preferences as any) || {};
      const dna = prefs?.decision_dna ?? null;
      const conf = Number(dna?.confidence_score);
      if (!dna || !Number.isFinite(conf) || conf < DNA_MIN_CONFIDENCE_FOR_BIAS) return null;
      const bias = Number(dna?.bias_map?.[alternativeId]);
      if (!Number.isFinite(bias)) return null;
      return bias;
    } catch {
      return null;
    }
  }

  /**
   * Returns additional effort_delta to add for this alternative (e.g. 0.15) when rollback history shows
   * the user often undoes this path across multiple trips.
   */
  async getRollbackBiasEffortDelta(userId: string | null | undefined, alternativeId: string): Promise<number> {
    const uid = userId != null ? String(userId).trim() : '';
    const aid = String(alternativeId ?? '').trim();
    if (!uid || !aid || !this.prisma) return 0;

    // Prefer DNA (persisted) over ad-hoc scan.
    const fromDna = await this.getBiasFromDecisionDna(uid, aid);
    if (fromDna != null) return fromDna;

    const rows = await this.prisma.itineraryRevision.findMany({
      where: {
        userId: uid,
        kind: 'ROLLBACK',
        alternativeId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      take: DEFAULT_ROLLBACK_LOOKBACK,
      select: { alternativeId: true },
    });

    if (rows.length < MIN_SAMPLES_FOR_BIAS) return 0;

    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.alternativeId ?? '').trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    let dominant = '';
    let dominantCount = 0;
    for (const [k, c] of counts) {
      if (c > dominantCount) {
        dominant = k;
        dominantCount = c;
      }
    }

    const total = rows.length;
    if (
      dominant === aid &&
      dominantCount >= MIN_DOMINANT_COUNT &&
      dominantCount / total >= DOMINANCE_RATIO
    ) {
      return GLOBAL_ROLLBACK_BIAS_EFFORT;
    }
    return 0;
  }
}
