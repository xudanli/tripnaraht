import type { ExtractedRoute } from '../types/guide-to-plan.types';

export function enrichCandidatesFromGuideRoutes<
  T extends { rawName: string; suggestedDay?: number | null; routeOrder?: number | null },
>(candidates: T[], routes: ExtractedRoute[]): T[] {
  if (routes.length === 0) return candidates;

  const enriched = candidates.map((c) => ({ ...c }));
  const byName = new Map(enriched.map((c) => [c.rawName.trim().toLowerCase(), c]));

  for (const route of routes) {
    const day = route.day;
    if (!day || day < 1) continue;
    route.placeNames.forEach((placeName, idx) => {
      const key = placeName.trim().toLowerCase();
      const match =
        byName.get(key) ??
        enriched.find(
          (c) =>
            c.rawName.toLowerCase().includes(key) || key.includes(c.rawName.toLowerCase()),
        );
      if (!match) return;
      if (match.suggestedDay == null) match.suggestedDay = day;
      if (match.routeOrder == null) match.routeOrder = idx + 1;
    });
  }

  return enriched;
}
