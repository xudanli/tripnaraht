import { TravelerInfo } from '../../interfaces/pacing-config.interface';
import { RouteDirectionData } from '../../../route-directions/interfaces/route-direction.interface';
import { UserPersona } from '../../../agent/memory/interfaces/multi-persona.interface';
import { RhythmType } from './rhythm-matching.interface';
export interface IndividualPreference {
    travelerId: string;
    travelerInfo: TravelerInfo;
    persona?: UserPersona;
    rhythmPreference?: RhythmType;
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    interests?: string[];
    mustPlaces?: string[];
    avoidPlaces?: string[];
    budgetPreference?: 'BUDGET' | 'MODERATE' | 'LUXURY';
    timePreference?: 'EARLY_BIRD' | 'NORMAL' | 'NIGHT_OWL';
}
export type ConflictType = 'RHYTHM_MISMATCH' | 'RISK_TOLERANCE_GAP' | 'INTEREST_DIVERGENCE' | 'BUDGET_CONFLICT' | 'TIME_PREFERENCE_GAP' | 'PHYSICAL_CAPACITY_GAP' | 'MUST_PLACE_CONFLICT';
export interface Conflict {
    id: string;
    type: ConflictType;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    involvedTravelers: string[];
    description: string;
    reason: string;
    impact: string[];
}
export interface Consensus {
    id: string;
    type: 'RHYTHM' | 'INTEREST' | 'BUDGET' | 'TIME' | 'RISK' | 'OTHER';
    involvedTravelers: string[];
    description: string;
    strength: number;
}
export type CoordinationStrategy = 'SEGMENTED_RHYTHM' | 'OVERALL_RELAXED_WITH_UPGRADE' | 'SPLIT_ACTIVITIES' | 'COMPROMISE_MIDDLE' | 'ROTATING_PRIORITY' | 'INDEPENDENT_TIME';
export interface CoordinationOption {
    id: string;
    strategy: CoordinationStrategy;
    description: string;
    implementation: string[];
    resolvedConflicts: string[];
    advantages: string[];
    disadvantages: string[];
    suitabilityScore: number;
    expectedSatisfaction: Record<string, number>;
}
export interface IndividualFitAnalysis {
    travelerId: string;
    overallMatch: number;
    rhythmMatch: number;
    interestMatch: number;
    riskMatch: number;
    physicalMatch: number;
    matchPoints: string[];
    mismatchPoints: string[];
    suggestions: string[];
}
export interface DiscussionTopic {
    id: string;
    title: string;
    description: string;
    relatedConflicts: string[];
    discussionPoints: string[];
    suggestedQuestions: string[];
}
export interface CoordinationResult {
    individualAnalysis: IndividualFitAnalysis[];
    conflictAreas: Conflict[];
    consensus: Consensus[];
    optionsForCoordination: CoordinationOption[];
    suggestedDiscussionPoints: DiscussionTopic[];
    overallRecommendation: string;
}
export interface RoutePlanDraft {
    route: RouteDirectionData;
    suggestedRhythm?: RhythmType;
    estimatedDays?: number;
    estimatedBudget?: number;
}
