import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { GLOBAL_ROLLBACK_BIAS_EFFORT } from './user-preference-learning.service';
import type { DecisionDnaEvolutionReason } from '../memory/governance/decision-dna-compliance.types';
import { mapDecisionDnaToMemoryPatch } from '../memory/utils/decision-dna-memory.mapper';
import type { MemoryStateV1 } from '../memory/schemas/memory-state.schema.v1';
import { MEMORY_STATE_SCHEMA_VERSION } from '../memory/schemas/memory-state.schema.v1';

export type DecisionDnaDto = {
  version: 1;
  bias_map: Record<string, number>;
  dominant_alternative: string | null;
  rollback_rate: number;
  confidence_score: number;
  last_synced_at: string;
  traits?: {
    time_sensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
    cost_sensitivity?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
};

const LOOKBACK = 25;
const MIN_SAMPLES = 5;
const DOMINANCE_RATIO = 0.5;
const MIN_DOMINANT_COUNT = 3;

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function toIso(d: Date): string {
  return d.toISOString();
}

@Injectable()
export class UserProfileLearningService {
  constructor(@Optional() private readonly prisma?: PrismaService) {}

  /**
   * Sync Decision DNA into `UserProfile.preferences.decision_dna`.
   * - aggregates last N rollback records (userId-scoped)
   * - writes bias_map + confidence + traits
   */
  async syncPreferenceToProfile(params: {
    userId: string | null | undefined;
    now?: Date;
    reason?: DecisionDnaEvolutionReason;
  }): Promise<DecisionDnaDto | null> {
    const uid = params.userId != null ? String(params.userId).trim() : '';
    if (!uid || !this.prisma) return null;

    const now = params.now ?? new Date();

    const rows = await this.prisma.itineraryRevision.findMany({
      where: { userId: uid, kind: 'ROLLBACK', alternativeId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: LOOKBACK,
      select: { alternativeId: true },
    });

    const total = rows.length;
    const counts = new Map<string, number>();
    for (const r of rows) {
      const k = String(r.alternativeId ?? '').trim();
      if (!k) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }

    let dominant: string | null = null;
    let dominantCount = 0;
    for (const [k, c] of counts) {
      if (c > dominantCount) {
        dominant = k;
        dominantCount = c;
      }
    }

    const rollback_rate = total > 0 ? clamp01(dominantCount / total) : 0;
    const confidence_score = clamp01(total / 10); // v1: 10 samples ~ full confidence; monotonic & explainable

    const bias_map: Record<string, number> = {};
    if (total >= MIN_SAMPLES && dominant && dominantCount >= MIN_DOMINANT_COUNT && dominantCount / total >= DOMINANCE_RATIO) {
      bias_map[dominant] = GLOBAL_ROLLBACK_BIAS_EFFORT;
    }

    const traits: DecisionDnaDto['traits'] = {};
    if (dominant === 'UPGRADE_TO_DRIVE') {
      // Often rolls back paid upgrade → price-averse.
      traits.cost_sensitivity = 'HIGH';
      traits.time_sensitivity = 'LOW';
    } else if (dominant === 'POSTPONE_SCHEDULE') {
      // Often rolls back postponing → delay-averse.
      traits.time_sensitivity = 'HIGH';
      traits.cost_sensitivity = 'LOW';
    }

    const dna: DecisionDnaDto = {
      version: 1,
      bias_map,
      dominant_alternative: dominant,
      rollback_rate,
      confidence_score,
      last_synced_at: toIso(now),
      ...(Object.keys(traits).length ? { traits } : {}),
    };

    const existing = await this.prisma.userProfile.findUnique({
      where: { userId: uid },
      select: { preferences: true },
    });
    const prefs = (existing?.preferences as any) || {};
    prefs.decision_dna = dna;

    if (params.reason) {
      const patch = mapDecisionDnaToMemoryPatch({
        userId: uid,
        dna,
        reason: params.reason,
        now,
      });
      const prev = (prefs.memory_state_v1 as MemoryStateV1 | undefined) ?? {
        schemaVersion: MEMORY_STATE_SCHEMA_VERSION,
        userId: uid,
        longTerm: {},
        updatedAt: patch.updatedAt,
      };
      prefs.memory_state_v1 = {
        ...prev,
        schemaVersion: MEMORY_STATE_SCHEMA_VERSION,
        userId: uid,
        longTerm: { ...prev.longTerm, ...(patch.longTermPatch ?? {}) },
        decisionDnaRef: patch.decisionDnaRef,
        updatedAt: patch.updatedAt,
      };
    }

    await this.prisma.userProfile.upsert({
      where: { userId: uid },
      update: { preferences: prefs, updatedAt: now },
      create: { userId: uid, preferences: prefs, updatedAt: now },
    });

    return dna;
  }
}

