/**
 * Narrative Itinerary — 体验化行程输出（非结构化计划清单）
 */

import type { ISODate } from '../decision/world-model';

export type EmotionalArc =
  | 'CALM'
  | 'ADVENTURE'
  | 'CHAOTIC'
  | 'DISCOVERY';

export interface NarrativeDay {
  readonly dayIndex: number;
  readonly date?: ISODate;
  readonly story: string;
  readonly keyMoments: readonly string[];
  readonly emotionalTone: EmotionalArc;
}

export interface ItineraryNarrative {
  readonly title: string;
  readonly summary: string;
  readonly storyByDay: readonly NarrativeDay[];
  readonly emotionalArc: EmotionalArc;
  readonly tradeoffNarratives: readonly string[];
}
