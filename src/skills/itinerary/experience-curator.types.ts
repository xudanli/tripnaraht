/**
 * itinerary.experience_curator — 旅行体验策划分型 Skill 合同
 */

import type { Itinerary } from '../../agent/interfaces/trip-plan.interface';
import type { ExperienceFlowModel } from '../../trips/decision/models/experience-flow.model';
import type { OdysseyPersonaSnapshot } from './adaptive-replan.types';
import type { ExperienceAlignScoreBreakdown } from './experience-align.types';

export type PacingStrategy = 'cinematic_climax' | 'harmonic_flow' | 'slow_burn';

export interface GoldenHourAlignmentPrefs {
  sunset: boolean;
  sunrise: boolean;
  auroraOrMilkyWay?: boolean;
}

export interface ExperiencePreferences {
  scenicDriveWeight: number;
  sensoryAlternation: boolean;
  goldenHourAlignment: GoldenHourAlignmentPrefs;
  pacingStrategy: PacingStrategy;
}

export interface ExperienceCuratorPayload {
  tripId: string;
  targetDays: number[];
  currentDraftItinerary: Itinerary;
  experiencePreferences: ExperiencePreferences;
  userIntent?: string;
  personaSnapshot?: OdysseyPersonaSnapshot;
  experienceFlow?: ExperienceFlowModel;
  research_data?: Record<string, unknown>;
}

export interface ExperienceMetrics extends ExperienceAlignScoreBreakdown {
  golden_hour_fit?: number;
  sensory_balance?: number;
  transition_cushion?: number;
}

export interface CuratorPhaseResult {
  phase: 'golden_hour' | 'sensory' | 'cinematic' | 'rhythm' | 'pacing_relax';
  applied: boolean;
  notes_zh: string[];
}

export interface ExperienceCuratorOutput {
  itinerary: Itinerary;
  metrics: ExperienceMetrics;
  preferences: ExperiencePreferences;
  phases: CuratorPhaseResult[];
  curation_notes_zh: string[];
  experience_flow_tempo?: string;
  telemetry: {
    duration_ms: number;
    narrative: string;
  };
}
