import { OrchestratorState, TripPlanRequest, GateResult, Itinerary, DecisionLogEntry } from './trip-plan.interface';
export interface PlannerAgent {
    analyzeRequest(request: TripPlanRequest, context: OrchestratorState): Promise<{
        intent: string;
        gaps: Array<{
            type: 'MISSING_DESTINATION' | 'MISSING_DATES' | 'MISSING_CONSTRAINTS' | 'MISSING_PREFERENCES';
            severity: 'HARD' | 'SOFT';
            detail: string;
        }>;
        candidate_structure?: {
            suggested_days: number;
            suggested_route?: string[];
            key_pois?: string[];
        };
    }>;
}
export interface GatekeeperAgent {
    evaluateGate(request: TripPlanRequest, researchData: Record<string, any>, context: OrchestratorState): Promise<GateResult>;
}
export interface ComplianceAgent {
    checkCompliance(itinerary: Itinerary, gateResult: GateResult, context: OrchestratorState): Promise<{
        risk_warnings: Array<{
            level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
            category: 'SAFETY' | 'LEGAL' | 'HEALTH' | 'FINANCIAL' | 'LOGISTICS';
            message: string;
            requires_user_confirmation: boolean;
        }>;
        disclaimers: string[];
        required_confirmations: string[];
    }>;
}
export interface LocalInsightAgent {
    suggestAlternatives(request: TripPlanRequest, gateResult: GateResult, context: OrchestratorState): Promise<{
        alternative_pois: Array<{
            poi_id: string;
            name: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
        alternative_routes: Array<{
            route_id: string;
            description: string;
            reason: string;
            evidence_status: 'VERIFIED' | 'UNVERIFIED' | 'ASSUMPTION';
            evidence_refs?: string[];
        }>;
    }>;
}
export interface CoreDecisionAgent {
    makeDecision(candidates: Array<{
        itinerary: Itinerary;
        score: number;
        pros: string[];
        cons: string[];
        evidence_refs: string[];
    }>, request: TripPlanRequest, context: OrchestratorState): Promise<{
        selected_itinerary: Itinerary;
        decision_reasoning: string;
        rejected_candidates: Array<{
            itinerary_id: string;
            reason: string;
        }>;
    }>;
}
export interface NarratorAgent {
    narrate(itinerary: Itinerary, gateResult: GateResult, decisionLog: DecisionLogEntry[], context: OrchestratorState): Promise<{
        user_friendly_summary: string;
        day_by_day_narrative: Array<{
            day: number;
            date: string;
            narrative: string;
        }>;
        highlights: string[];
        tips: string[];
        warnings?: string[];
    }>;
}
export interface GeoPoint {
    lat: number;
    lng: number;
}
export interface EvidenceRef {
    evidence_id: string;
    source: string;
    timestamp: string;
    data: any;
}
export interface DataQuality {
    source_type: 'REALTIME_API' | 'CACHED' | 'HISTORICAL' | 'ESTIMATED' | 'MOCK';
    freshness_seconds: number;
    confidence: number;
    coverage: number;
    retrieved_at: string;
    expires_at?: string;
    fallback_info?: {
        original_source: string;
        fallback_reason: string;
        quality_impact: 'NONE' | 'MINOR' | 'MODERATE' | 'SIGNIFICANT';
    };
}
export interface GeoAgent {
    analyzeTerrain(route: GeoPoint[]): Promise<{
        elevation_profile: Array<{
            distance_km: number;
            elevation_m: number;
        }>;
        total_ascent_m: number;
        total_descent_m: number;
        max_elevation_m: number;
        min_elevation_m: number;
        max_slope_deg: number;
        terrain_type: 'FLAT' | 'HILLY' | 'MOUNTAINOUS' | 'ALPINE';
        difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    checkRouteFeasibility(origin: GeoPoint, destination: GeoPoint, transportMode: 'DRIVE' | 'WALK' | 'CYCLE' | 'TRANSIT'): Promise<{
        is_reachable: boolean;
        blocking_factors?: string[];
        estimated_duration_min: number;
        estimated_distance_km: number;
        difficulty: 'EASY' | 'MODERATE' | 'HARD' | 'EXPERT';
        confidence: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    findNearbyPOIs(center: GeoPoint, radius_km: number, categories?: string[]): Promise<{
        pois: Array<{
            poi_id: string;
            name: string;
            category: string;
            location: GeoPoint;
            distance_km: number;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
}
export interface WeatherAgent {
    getForecast(location: GeoPoint, dateRange: {
        start: string;
        end: string;
    }): Promise<{
        forecasts: Array<{
            date: string;
            temperature: {
                min: number;
                max: number;
            };
            precipitation: {
                probability: number;
                type: string;
                amount_mm: number;
            };
            wind: {
                speed_kmh: number;
                gust_kmh: number;
                direction: string;
            };
            visibility_km: number;
            travel_suitability: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DANGEROUS';
        }>;
        overall_confidence: number;
        data_freshness: {
            last_update: string;
            reliability: number;
        };
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    assessRoadClosureProbability(route: GeoPoint[], date: string): Promise<{
        overall_closure_probability: number;
        risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        closure_factors: Array<{
            factor: 'SNOW' | 'ICE' | 'FLOODING' | 'WIND' | 'VISIBILITY' | 'OTHER';
            probability: number;
            impact: string;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    quantifyWeatherRisk(location: GeoPoint, date: string, activityType: 'DRIVING' | 'HIKING' | 'SIGHTSEEING' | 'OUTDOOR_ACTIVITY'): Promise<{
        risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        risk_score: number;
        risk_factors: Array<{
            type: string;
            severity: 'LOW' | 'MEDIUM' | 'HIGH';
            description: string;
            mitigation: string;
        }>;
        what_you_pay_for: string;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
}
export interface CostAgent {
    estimateTripCost(destination: string, dateRange: {
        start: string;
        end: string;
    }, travelers: number, preferences?: {
        accommodation_level?: 'BUDGET' | 'MID_RANGE' | 'LUXURY';
        dining_level?: 'BUDGET' | 'MID_RANGE' | 'FINE_DINING';
    }): Promise<{
        total_estimate: {
            optimistic: number;
            expected: number;
            pessimistic: number;
            currency: string;
        };
        breakdown: {
            accommodation: number;
            transport: number;
            activities: number;
            dining: number;
            other: number;
        };
        confidence: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    analyzePriceCurve(service: 'FLIGHT' | 'HOTEL' | 'CAR_RENTAL', destination: string, dateRange: {
        start: string;
        end: string;
    }): Promise<{
        price_trend: Array<{
            date: string;
            price: number;
        }>;
        peak_periods: Array<{
            start: string;
            end: string;
            multiplier: number;
        }>;
        optimal_booking_window: {
            start: string;
            end: string;
        };
        expected_saving_percent: number;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
    optimizeBudget(totalBudget: number, requirements: {
        destination: string;
        days: number;
        travelers: number;
        must_haves?: string[];
    }): Promise<{
        recommended_allocation: {
            accommodation: {
                amount: number;
                percentage: number;
            };
            transport: {
                amount: number;
                percentage: number;
            };
            activities: {
                amount: number;
                percentage: number;
            };
            dining: {
                amount: number;
                percentage: number;
            };
            buffer: {
                amount: number;
                percentage: number;
            };
        };
        feasibility: 'COMFORTABLE' | 'TIGHT' | 'INSUFFICIENT';
        saving_opportunities: Array<{
            category: string;
            suggestion: string;
            potential_saving: number;
            tradeoff: string;
        }>;
        evidence: EvidenceRef[];
        data_quality: DataQuality;
    }>;
}
export interface ExperienceAgent {
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
}
