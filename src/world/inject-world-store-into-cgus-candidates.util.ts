/**
 * 将 WorldConstraintStore 快照中的高压条目注入 CGUS 候选违反列表。
 */

import type { CGUSCandidate } from '../trips/decision/optimization/cgus-search.service';
import { constraintFieldsFromSnapshot, type WorldConstraintStoreSnapshot } from './world-snapshot';

export function injectWorldStoreViolationsIntoCgusCandidates(
  candidates: CGUSCandidate[],
  snapshot: WorldConstraintStoreSnapshot | undefined,
): CGUSCandidate[] {
  if (!snapshot) return candidates;

  const fields = constraintFieldsFromSnapshot(snapshot);
  const stressedRoads = fields.filter(
    (f) => f.type === 'ROAD' && (f.state === 'CLOSED' || f.state === 'RESTRICTED'),
  );
  const stressedWeather = fields.filter(
    (f) => f.type === 'WEATHER' && (f.state === 'CLOSED' || f.state === 'DEGRADED'),
  );

  if (!stressedRoads.length && !stressedWeather.length) {
    return candidates;
  }

  return candidates.map((c) => {
    const extra = [
      ...stressedRoads.map((r) => ({
        type: `WORLD_ROAD_${r.id}`,
        severity: (r.state === 'CLOSED' ? 'HARD' : 'SOFT') as 'HARD' | 'SOFT',
        degree: Math.min(1, (r.severity ?? 50) / 100),
        detail: `rag_ssot_road:${r.state}`,
      })),
      ...stressedWeather.map((w) => ({
        type: `WORLD_WEATHER_${w.id}`,
        severity: (w.state === 'CLOSED' ? 'HARD' : 'SOFT') as 'HARD' | 'SOFT',
        degree: Math.min(1, (w.severity ?? 40) / 100),
        detail: `rag_ssot_weather:${w.state}`,
      })),
    ];

    const hardAdded = extra.some((v) => v.severity === 'HARD');
    return {
      ...c,
      constraintViolations: [...c.constraintViolations, ...extra],
      feasible: c.feasible && !hardAdded,
    };
  });
}
