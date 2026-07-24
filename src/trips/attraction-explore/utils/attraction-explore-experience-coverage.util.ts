import type { Place } from '@prisma/client';
import { matchesTheme } from './attraction-explore-place.util';

export type ExperienceCategory =
  | 'nature_landscapes'
  | 'culture_history'
  | 'hot_springs'
  | 'food_experience'
  | 'urban_culture'
  | 'relaxed_rest';

export const EXPERIENCE_CATEGORY_LABELS: Record<ExperienceCategory, string> = {
  nature_landscapes: '自然景观',
  culture_history: '人文历史',
  hot_springs: '温泉休息',
  food_experience: '美食体验',
  urban_culture: '城市文化',
  relaxed_rest: '恢复性体验',
};

export function classifyPlaceExperience(place: Place): ExperienceCategory {
  if (matchesTheme(place, 'hot_springs')) return 'hot_springs';
  if (matchesTheme(place, 'culture_history')) return 'culture_history';
  if (/雷克雅未克|reykjavik|城市|city walk|漫步/i.test(`${place.nameCN} ${place.nameEN ?? ''}`)) {
    return 'urban_culture';
  }
  if (/餐厅|restaurant|food|美食|café|cafe|咖啡/i.test(`${place.nameCN} ${place.nameEN ?? ''}`)) {
    return 'food_experience';
  }
  if (matchesTheme(place, 'nature_landscapes') || matchesTheme(place, 'waterfalls') || matchesTheme(place, 'glaciers')) {
    return 'nature_landscapes';
  }
  return 'nature_landscapes';
}

export interface ExperienceCoverageSnapshot {
  distribution: Record<ExperienceCategory, number>;
  dominant: ExperienceCategory | null;
  gaps: ExperienceCategory[];
}

export function buildExperienceCoverage(
  places: Place[],
): ExperienceCoverageSnapshot {
  const counts: Record<ExperienceCategory, number> = {
    nature_landscapes: 0,
    culture_history: 0,
    hot_springs: 0,
    food_experience: 0,
    urban_culture: 0,
    relaxed_rest: 0,
  };

  for (const place of places) {
    counts[classifyPlaceExperience(place)] += 1;
  }

  const total = places.length || 1;
  const distribution = Object.fromEntries(
    (Object.keys(counts) as ExperienceCategory[]).map((key) => [
      key,
      Math.round((counts[key] / total) * 100),
    ]),
  ) as Record<ExperienceCategory, number>;

  const sorted = (Object.keys(counts) as ExperienceCategory[]).sort(
    (a, b) => counts[b] - counts[a],
  );
  const dominant = places.length > 0 ? sorted[0]! : null;

  const gaps = (Object.keys(counts) as ExperienceCategory[]).filter(
    (key) => distribution[key] < 10,
  );

  return { distribution, dominant, gaps };
}

export function experienceGapScore(place: Place, gaps: ExperienceCategory[]): number {
  const category = classifyPlaceExperience(place);
  if (!gaps.includes(category)) return 0;
  if (category === 'urban_culture' || category === 'culture_history') return 12;
  if (category === 'food_experience' || category === 'hot_springs') return 10;
  if (category === 'relaxed_rest') return 8;
  return 6;
}
