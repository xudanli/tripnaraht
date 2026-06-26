/**
 * Candidate Contract — PRD §10
 */

import type { ExperienceAtomCode, ExperienceIntentPriority } from './experience-atom.types';

export type ItineraryItemRole = 'ANCHOR' | 'RECOMMENDED' | 'FLEXIBLE';

export interface ProposedExperienceAtom {
  atom: ExperienceAtomCode | string;
  expectedStrength: number;
  priority: ExperienceIntentPriority;
}

export interface ProposedTimeWindow {
  start: string;
  end: string;
}

export interface ExperienceCandidate {
  candidateId: string;
  poiId: string;
  proposedExperienceAtoms: ProposedExperienceAtom[];
  intendedParticipants: string[];
  proposedTimeWindow: ProposedTimeWindow;
  expectedDwellMinutes: number;
  itineraryRole: ItineraryItemRole;
  rationale: string;
  evidenceRefs: string[];
}
