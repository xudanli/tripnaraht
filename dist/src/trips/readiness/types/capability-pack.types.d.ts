import { Action, RuleSeverity, ReadinessCategory } from './readiness-pack.types';
export type CapabilityPackType = 'high_altitude' | 'sparse_supply' | 'seasonal_road' | 'permit_checkpoint' | 'emergency';
export interface CapabilityPackConfig {
    type: CapabilityPackType;
    displayName: string;
    trigger: CapabilityTrigger;
    rules: CapabilityRule[];
    hazards?: CapabilityHazard[];
    metadata?: {
        description?: string;
        applicableRegions?: string[];
        priority?: number;
    };
}
export interface CapabilityTrigger {
    all?: CapabilityCondition[];
    any?: CapabilityCondition[];
    not?: CapabilityCondition;
}
export interface CapabilityCondition {
    geoPath?: string;
    operator?: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'ne' | 'in' | 'exists' | 'containsAny';
    value?: any;
    contextPath?: string;
    all?: CapabilityCondition[];
    any?: CapabilityCondition[];
    not?: CapabilityCondition;
}
export interface CapabilityRule {
    id: string;
    category: ReadinessCategory;
    severity: RuleSeverity;
    appliesTo?: {
        seasons?: string[];
        activities?: string[];
        travelerTags?: string[];
    };
    when: CapabilityCondition;
    then: Action;
    evidence?: Array<{
        sourceId: string;
        sectionId?: string;
        quote?: string;
    }>;
    notes?: string;
}
export interface CapabilityHazard {
    type: string;
    severity: RuleSeverity;
    summary: string;
    mitigations: string[];
}
export interface HighAltitudePackConfig extends CapabilityPackConfig {
    type: 'high_altitude';
    trigger: {
        all?: Array<{
            geoPath: 'geo.mountains.mountainElevationAvg';
            operator: 'gte';
            value: number;
        } | {
            contextPath: 'itinerary.countries';
            operator: 'in';
            value: string[];
        }>;
    };
}
export interface SparseSupplyPackConfig extends CapabilityPackConfig {
    type: 'sparse_supply';
    trigger: {
        all?: Array<{
            geoPath: 'geo.roads.roadDensityScore';
            operator: 'lt';
            value: number;
        } | {
            geoPath: 'geo.pois.supplyDensity';
            operator: 'lt';
            value: number;
        } | {
            contextPath: 'itinerary.routeLength';
            operator: 'gt';
            value: number;
        }>;
    };
}
export interface SeasonalRoadPackConfig extends CapabilityPackConfig {
    type: 'seasonal_road';
    trigger: {
        all?: Array<{
            geoPath: 'geo.mountains.inMountain';
            operator: 'eq';
            value: true;
        } | {
            contextPath: 'itinerary.season';
            operator: 'in';
            value: string[];
        } | {
            geoPath: 'geo.roads.hasMountainPass';
            operator: 'eq';
            value: true;
        }>;
    };
}
export interface PermitCheckpointPackConfig extends CapabilityPackConfig {
    type: 'permit_checkpoint';
    trigger: {
        any?: Array<{
            geoPath: 'geo.pois.hasCheckpoint';
            operator: 'eq';
            value: true;
        } | {
            contextPath: 'itinerary.countries';
            operator: 'in';
            value: string[];
        } | {
            contextPath: 'itinerary.activities';
            operator: 'containsAny';
            value: string[];
        }>;
    };
}
export interface EmergencyPackConfig extends CapabilityPackConfig {
    type: 'emergency';
    trigger: CapabilityTrigger;
}
export interface CapabilityPackResult {
    packType: CapabilityPackType;
    triggered: boolean;
    rules: Array<{
        id: string;
        triggered: boolean;
        level: string;
        message: string;
    }>;
    hazards: Array<{
        type: string;
        severity: string;
        summary: string;
    }>;
}
