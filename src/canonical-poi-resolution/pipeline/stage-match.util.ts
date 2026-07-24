import type { StageMatchCandidate } from './exact-alias.stage';

export function dedupeStageCandidatesByPoiId(items: StageMatchCandidate[]): StageMatchCandidate[] {
  const byId = new Map<string, StageMatchCandidate>();
  for (const item of items) {
    const prev = byId.get(item.poi.poiId);
    if (!prev || item.confidence > prev.confidence) {
      byId.set(item.poi.poiId, item);
    }
  }
  return [...byId.values()].sort((a, b) => b.confidence - a.confidence);
}
