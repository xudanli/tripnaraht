/**
 * Travel DNA — 四视角叙事形式（Narrative Engine V1 子集 + V2/V3 预留）
 */

import type { CompiledIntent } from '../../intent/intent.compiler';
import type { MobilityPreference, PacePreference } from '../../intent/intent.model';
import type { NarrativeArcTemplate, ReflectionMode, TravelMotivation } from './narrative-arc.types';

export type { NarrativeArcTemplate, ReflectionMode, TravelMotivation, CompanionContext } from './narrative-arc.types';

export interface NarrativeIntakeInput {
  recentState?: string;
  motivations?: TravelMotivation[];
  moodKeywords?: string[];
  freeText?: string;
}

export interface ThemeCandidate {
  id: string;
  title: string;
  tagline: string;
  arcTemplate: NarrativeArcTemplate;
  resonanceHint?: string;
  confidence: 'high' | 'medium' | 'low';
  fallbackGenerated: boolean;
}

export interface TripNarrativeThemeMetadata {
  schemaVersion: 1;
  selectedThemeId: string;
  title: string;
  tagline: string;
  arcTemplate: NarrativeArcTemplate;
  reflectionMode: ReflectionMode;
  intakeSnapshot?: NarrativeIntakeInput;
  selectedAt: string;
  generationRequestId?: string;
  regenerateCount: number;
}

export interface NarrativeChapter {
  dayIndex: number;
  date?: string;
  title: string;
  emotionalBeat: 'opening' | 'rising' | 'challenge' | 'turn' | 'resolution' | 'quiet';
  motifs: string[];
  sceneConstraints?: SceneConstraint[];
}

export interface SceneConstraint {
  preferPoiCategories?: string[];
  avoidPoiCategories?: string[];
  maxDailyDriveHoursOverride?: number;
  aweMomentSlot?: boolean;
}

export interface TravelStoryform {
  schemaVersion: 1;
  objective: {
    compiledIntent?: CompiledIntent;
    destination?: string;
    tripDays?: number;
  };
  protagonist: {
    paceProfile?: PacePreference;
    mobilityPreference?: MobilityPreference;
    selfDescription?: string;
    emotionalBaseline?: string;
  };
  catalyst: {
    motivations: TravelMotivation[];
    recentState?: string;
    lifeChapter?: string;
  };
  relational: {
    companionContext?: import('./narrative-arc.types').CompanionContext;
    connectionIntent?: string[];
  };
  narrativePreferences: {
    arcTemplate: NarrativeArcTemplate;
    reflectionMode: ReflectionMode;
    moodKeywords?: string[];
  };
  selectedTheme?: {
    themeId: string;
    title: string;
    tagline: string;
    selectedAt: string;
  };
  chapters?: NarrativeChapter[];
  meta: {
    generationRequestId?: string;
    regenerateCount: number;
    intakeSnapshot?: NarrativeIntakeInput;
    updatedAt: string;
  };
}

/** Pending candidate batch stored in Trip.metadata._narrativePending */
export interface NarrativePendingSession {
  generationRequestId: string;
  candidates: ThemeCandidate[];
  intakeSnapshot: NarrativeIntakeInput;
  regenerateCount: number;
  expiresAt: string;
  createdAt: string;
}

export interface GenerateCandidatesResult {
  candidates: ThemeCandidate[];
  generationRequestId: string;
  regenerateCount: number;
  expiresAt: string;
}
