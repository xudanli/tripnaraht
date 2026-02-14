import { ExperienceAgent, EvidenceRef, DataQuality } from '../../interfaces/sub-agent.interface';
import { Itinerary } from '../../interfaces/trip-plan.interface';
export declare class ExperienceAgentService implements ExperienceAgent {
    private readonly logger;
    constructor();
    analyzeExperienceDensity(itinerary: Itinerary): Promise<{
        density_curve: Array<{
            time_slot: string;
            density: number;
            experience_type: 'SCENIC' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
        }>;
        peak_experiences: Array<{
            time: string;
            location: string;
            experience: string;
            intensity: number;
        }>;
        low_points: Array<{
            time: string;
            reason: string;
            suggestion: string;
        }>;
        quality_score: {
            overall: number;
            variety: number;
            depth: number;
            uniqueness: number;
        };
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    predictFatigue(itinerary: Itinerary, userProfile: {
        fitness_level: 'LOW' | 'MEDIUM' | 'HIGH';
        age_group?: string;
    }): Promise<{
        daily_fatigue: Array<{
            day: number;
            date: string;
            fatigue_curve: Array<{
                time: string;
                fatigue_level: number;
            }>;
            peak_fatigue: {
                time: string;
                level: number;
                cause: string;
            };
            recovery_points: Array<{
                time: string;
                recovery: number;
            }>;
        }>;
        cumulative_fatigue: {
            trend: 'INCREASING' | 'STABLE' | 'DECREASING';
            end_of_trip_level: number;
            sustainable: boolean;
            warning?: string;
        };
        overexertion_probability: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    optimizePace(itinerary: Itinerary, preferences: {
        pace_priority: 'SLOW' | 'BALANCED' | 'FAST';
        fatigue_tolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    }): Promise<{
        current_pace: 'TOO_SLOW' | 'RELAXED' | 'BALANCED' | 'BRISK' | 'TOO_FAST';
        optimizations: Array<{
            type: 'ADD_BUFFER' | 'REMOVE_ITEM' | 'REORDER' | 'SPLIT_DAY' | 'ADD_REST';
            target: string;
            reason: string;
            impact: {
                pace_improvement: string;
                experience_impact: string;
                tradeoff: string;
            };
        }>;
        optimal_pace_template: {
            morning: 'SLOW' | 'MODERATE' | 'FAST';
            afternoon: 'SLOW' | 'MODERATE' | 'FAST';
            evening: 'SLOW' | 'MODERATE' | 'FAST';
            rest_periods: string[];
        };
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    assessHumanExecutability(itinerary: Itinerary, userProfile: {
        fitness_level: 'LOW' | 'MEDIUM' | 'HIGH';
        age_group?: string;
        special_needs?: string[];
    }): Promise<{
        executability_score: number;
        breakdown: {
            physical_demand: number;
            mental_demand: number;
            time_stress: number;
            recovery_adequacy: number;
        };
        challenge_points: Array<{
            time: string;
            challenge: string;
            severity: 'MANAGEABLE' | 'CHALLENGING' | 'DIFFICULT' | 'EXTREME';
            adaptation: string;
        }>;
        human_tips: Array<{
            tip: string;
            timing: string;
            reason: string;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    private categorizeExp;
    private calcDensityFromItem;
    private isHighlightItem;
    private calcIntensityFromItem;
    private calcItemFatigue;
    private calculateDayDriveDistance;
    private createDataQuality;
}
