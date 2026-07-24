/**
 * Tab BFF include presets — optimized for first paint (see trip-detail-tab-bff-profile.ts).
 */

export type BffIncludePreset = 'shell' | 'full';

const TIMELINE_SHELL = 'stats,readiness';
/** Phase-2 tab body — no suggestions list (use stats.newSuggestionCount + lazy suggestions). */
const TIMELINE_FULL = 'stats,pipeline,tasks,reminders,readiness';
const TIMELINE_WITH_SUGGESTIONS = 'stats,pipeline,tasks,reminders,readiness,suggestions';

const COLLAB_SHELL = 'members,health';
const COLLAB_FULL = 'members,tasks,domain,votes,profiling,wishes,health';

export function resolveBffIncludeFromPreset(input: {
  preset?: string;
  include?: string;
  kind: 'timeline' | 'collab';
}): string | undefined {
  if (input.include?.trim()) {
    return input.include.trim();
  }
  const preset = input.preset?.trim().toLowerCase() as BffIncludePreset | '';
  if (preset === 'shell') {
    return input.kind === 'timeline' ? TIMELINE_SHELL : COLLAB_SHELL;
  }
  if (preset === 'full') {
    return input.kind === 'timeline' ? TIMELINE_FULL : COLLAB_FULL;
  }
  return undefined;
}

export const BFF_INCLUDE_PRESETS = {
  timelineShell: TIMELINE_SHELL,
  timelineFull: TIMELINE_FULL,
  timelineWithSuggestions: TIMELINE_WITH_SUGGESTIONS,
  collabShell: COLLAB_SHELL,
  collabFull: COLLAB_FULL,
} as const;
