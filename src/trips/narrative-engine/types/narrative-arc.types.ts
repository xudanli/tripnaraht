/** V1 可用弧线；V2 增加 hero | transformation */
export type NarrativeArcTemplate =
  | 'exploration'
  | 'healing'
  | 'connection'
  | 'neutral';

export type ReflectionMode = 'analytical' | 'resonance' | 'silent';

export type TravelMotivation =
  | 'rest'
  | 'discovery'
  | 'connection'
  | 'challenge'
  | 'celebration'
  | 'closure'
  | 'unsure';

export type CompanionContext = 'solo' | 'couple' | 'group' | 'family';

export const NARRATIVE_ARC_TEMPLATES: readonly NarrativeArcTemplate[] = [
  'exploration',
  'healing',
  'connection',
  'neutral',
] as const;

export const TRAVEL_MOTIVATIONS: readonly TravelMotivation[] = [
  'rest',
  'discovery',
  'connection',
  'challenge',
  'celebration',
  'closure',
  'unsure',
] as const;
