/**
 * Travel DNA Encoder — intake + trip 上下文 → TravelStoryform
 */

import type { CompiledIntent } from '../../intent/intent.compiler';
import type {
  NarrativeIntakeInput,
  ThemeCandidate,
  TravelStoryform,
} from '../types/travel-storyform.types';
import type { NarrativeArcTemplate, ReflectionMode } from '../types/narrative-arc.types';

export function resolvePrimaryArcTemplate(
  motivations: readonly string[] = [],
): NarrativeArcTemplate {
  const set = new Set(motivations);
  if (set.has('rest') || set.has('closure')) return 'healing';
  if (set.has('discovery') || set.has('challenge')) return 'exploration';
  if (set.has('connection') || set.has('celebration')) return 'connection';
  return 'neutral';
}

export function defaultReflectionMode(
  arc: NarrativeArcTemplate,
): ReflectionMode {
  if (arc === 'healing' || arc === 'neutral') return 'resonance';
  if (arc === 'connection') return 'analytical';
  return 'resonance';
}

export function encodeTravelStoryform(input: {
  intake: NarrativeIntakeInput;
  trip?: { destination?: string; tripDays?: number };
  selectedTheme?: ThemeCandidate;
  meta?: Partial<TravelStoryform['meta']>;
}): TravelStoryform {
  const motivations = input.intake.motivations ?? [];
  const arcTemplate =
    input.selectedTheme?.arcTemplate ?? resolvePrimaryArcTemplate(motivations);
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    objective: {
      destination: input.trip?.destination,
      tripDays: input.trip?.tripDays,
    },
    protagonist: {
      emotionalBaseline: input.intake.recentState,
    },
    catalyst: {
      motivations,
      recentState: input.intake.recentState,
    },
    relational: {},
    narrativePreferences: {
      arcTemplate,
      reflectionMode: defaultReflectionMode(arcTemplate),
      moodKeywords: input.intake.moodKeywords,
    },
    selectedTheme: input.selectedTheme
      ? {
          themeId: input.selectedTheme.id,
          title: input.selectedTheme.title,
          tagline: input.selectedTheme.tagline,
          selectedAt: now,
        }
      : undefined,
    meta: {
      generationRequestId: input.meta?.generationRequestId,
      regenerateCount: input.meta?.regenerateCount ?? 0,
      intakeSnapshot: input.intake,
      updatedAt: input.meta?.updatedAt ?? now,
    },
  };
}

export function mergeCompiledIntent(
  storyform: TravelStoryform,
  compiled: CompiledIntent,
): TravelStoryform {
  return {
    ...storyform,
    objective: {
      ...storyform.objective,
      compiledIntent: compiled,
    },
    meta: {
      ...storyform.meta,
      updatedAt: new Date().toISOString(),
    },
  };
}

export function storyformFromThemeMetadata(
  theme: import('../types/travel-storyform.types').TripNarrativeThemeMetadata,
  trip?: { destination?: string; tripDays?: number },
): TravelStoryform {
  const intake = theme.intakeSnapshot ?? { motivations: [] };
  return {
    schemaVersion: 1,
    objective: {
      destination: trip?.destination,
      tripDays: trip?.tripDays,
    },
    protagonist: {
      emotionalBaseline: intake.recentState,
    },
    catalyst: {
      motivations: intake.motivations ?? [],
      recentState: intake.recentState,
    },
    relational: {},
    narrativePreferences: {
      arcTemplate: theme.arcTemplate,
      reflectionMode: theme.reflectionMode,
      moodKeywords: intake.moodKeywords,
    },
    selectedTheme: {
      themeId: theme.selectedThemeId,
      title: theme.title,
      tagline: theme.tagline,
      selectedAt: theme.selectedAt,
    },
    meta: {
      generationRequestId: theme.generationRequestId,
      regenerateCount: theme.regenerateCount,
      intakeSnapshot: theme.intakeSnapshot,
      updatedAt: theme.selectedAt,
    },
  };
}
