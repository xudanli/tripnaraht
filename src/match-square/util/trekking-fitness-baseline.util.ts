import type { TrekkingFitnessBaseline } from '../types/physical-fitness-gate.types';

const BASELINE_KEY = 'trekking_fitness_baseline';

/** 无结构化数据时的保守默认 — Level 4+ 路线将触发硬拦截 */
export const DEFAULT_TREKKING_FITNESS_BASELINE: TrekkingFitnessBaseline = {
  maxDailyAscentM: 400,
  maxAltitudeM: 600,
  maxPackWeightKg: 6,
  heavyPackCampingVerified: false,
  recentAerobicSessions30d: 0,
  source: 'default',
};

export function parseTrekkingFitnessBaseline(
  extendedProfile: Record<string, unknown> | null | undefined,
): TrekkingFitnessBaseline {
  const raw = extendedProfile?.[BASELINE_KEY];
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TREKKING_FITNESS_BASELINE };

  const o = raw as Record<string, unknown>;
  return {
    maxDailyAscentM: num(o.maxDailyAscentM, DEFAULT_TREKKING_FITNESS_BASELINE.maxDailyAscentM),
    maxAltitudeM: num(o.maxAltitudeM, DEFAULT_TREKKING_FITNESS_BASELINE.maxAltitudeM),
    maxPackWeightKg: num(o.maxPackWeightKg, DEFAULT_TREKKING_FITNESS_BASELINE.maxPackWeightKg),
    heavyPackCampingVerified: o.heavyPackCampingVerified === true,
    recentAerobicSessions30d: num(
      o.recentAerobicSessions30d,
      DEFAULT_TREKKING_FITNESS_BASELINE.recentAerobicSessions30d,
    ),
    source:
      o.source === 'trip_history' || o.source === 'questionnaire' ? o.source : 'default',
    evidenceLabel: typeof o.evidenceLabel === 'string' ? o.evidenceLabel : null,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
    hardTrekMatchPenaltyCount:
      typeof o.hardTrekMatchPenaltyCount === 'number' && Number.isFinite(o.hardTrekMatchPenaltyCount)
        ? o.hardTrekMatchPenaltyCount
        : undefined,
  };
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function resolveRecruitmentScriptIdFromSnapshot(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const vibe = (snapshot as Record<string, unknown>)._vibeParse;
  if (vibe && typeof vibe === 'object') {
    const payload = (vibe as Record<string, unknown>).payload ?? vibe;
    if (payload && typeof payload === 'object') {
      const id = (payload as Record<string, unknown>).recruitment_script_id;
      if (typeof id === 'string' && id.trim()) return id.trim();
    }
  }
  const trek = (snapshot as Record<string, unknown>)._trekkingOrchestration;
  if (trek && typeof trek === 'object') {
    const id = (trek as Record<string, unknown>).scriptId;
    if (typeof id === 'string' && id.trim()) return id.trim();
  }
  return null;
}
