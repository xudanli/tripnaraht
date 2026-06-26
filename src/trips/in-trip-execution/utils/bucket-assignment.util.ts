import type { PsychologicalBucket } from '../types/money-brain.types';

const CATEGORY_TO_BUCKET: Record<string, PsychologicalBucket> = {
  dining: 'food',
  food: 'food',
  restaurant: 'food',
  transport: 'transportation',
  transportation: 'transportation',
  taxi: 'transportation',
  flight: 'transportation',
  accommodation: 'accommodation',
  hotel: 'accommodation',
  lodging: 'accommodation',
  activities: 'experience',
  activity: 'experience',
  experience: 'experience',
  sightseeing: 'experience',
  ticket: 'experience',
  shopping: 'other',
  souvenir: 'other',
  other: 'other',
  emergency: 'contingency',
  contingency: 'contingency',
};

const BUCKET_LABELS: Record<PsychologicalBucket, string> = {
  transportation: '交通',
  accommodation: '住宿',
  experience: '体验',
  food: '餐饮',
  other: '其他',
  contingency: '应急',
};

export const PSYCHOLOGICAL_BUCKETS: PsychologicalBucket[] = [
  'transportation',
  'accommodation',
  'experience',
  'food',
  'other',
  'contingency',
];

export function assignBucket(category: string): PsychologicalBucket {
  const key = category.trim().toLowerCase();
  return CATEGORY_TO_BUCKET[key] ?? 'other';
}

export function bucketLabel(bucket: PsychologicalBucket): string {
  return BUCKET_LABELS[bucket];
}

/** 钱包分录 category 与 CostCategory 对齐 */
export function toLedgerCategory(category: string): string {
  const bucket = assignBucket(category);
  switch (bucket) {
    case 'transportation':
      return 'TRANSPORTATION';
    case 'accommodation':
      return 'ACCOMMODATION';
    case 'food':
      return 'FOOD';
    case 'experience':
      return 'ACTIVITIES';
    case 'contingency':
    case 'other':
    default:
      return 'OTHER';
  }
}

/** structureVsActual key → psychological bucket */
export function structureKeyToBucket(key: string): PsychologicalBucket | null {
  const map: Record<string, PsychologicalBucket> = {
    transportation: 'transportation',
    accommodation: 'accommodation',
    experience: 'experience',
    food: 'food',
    other: 'other',
    activities: 'experience',
  };
  return map[key] ?? null;
}
