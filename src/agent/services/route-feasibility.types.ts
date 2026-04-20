import type { Itinerary } from '../interfaces/trip-plan.interface';

export interface FeasibilityResult {
  is_feasible: boolean;
  blocking_reason?: string;
  /** 0..100 (higher = riskier) */
  risk_level: number;
  /** 0..100 (higher = more fatigue) */
  fatigue_score: number;
}

export type FeasibilityFinding = {
  source: 'ITINERARY_VERIFY' | 'EXPERIENCE_EXECUTABILITY' | 'EXPERIENCE_FATIGUE' | 'TERRAIN' | 'EXTREME_RULES';
  severity: 'INFO' | 'WARNING' | 'BLOCK';
  code: string;
  message: string;
  data?: Record<string, unknown>;
};

export interface RouteFeasibilityEngineInput {
  itinerary: Itinerary;
  userProfile?: {
    fitness_level?: 'LOW' | 'MEDIUM' | 'HIGH';
    risk_tolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  };
  /**
   * Research evidence / world context from upstream stages.
   * Expected (best-effort):
   * - opening_hours_evidence, transport_evidence (used by itinerary.verify)
   * - world.physical.demEvidence[] (from world.buildContext)
   */
  researchData?: Record<string, unknown>;
  environment?: {
    /** Month 1..12 */
    month?: number;
    /** Optional quantitative weather facts */
    weather?: {
      wind_speed_mps?: number;
    };
  };
}

export interface RouteFeasibilityEngineOutput {
  result: FeasibilityResult;
  findings: FeasibilityFinding[];
  /** Convenient human-readable issues, stable for existing VERIFY output */
  issues: string[];
  /** Optional enriched itinerary (risk tags may be applied in-place) */
  itinerary: Itinerary;
}

