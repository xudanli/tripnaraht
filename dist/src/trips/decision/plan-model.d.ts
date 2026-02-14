import { ActivityType, GeoPoint, ISODate, ISOTime, TravelLeg } from './world-model';
export interface PlanSlot {
    id: string;
    time: ISOTime;
    endTime?: ISOTime;
    title: string;
    type: ActivityType;
    poiId?: string;
    coordinates?: GeoPoint;
    travelLegFromPrev?: TravelLeg;
    notes?: string;
    locked?: boolean;
    priorityTag?: 'anchor' | 'core' | 'optional';
    reasons?: string[];
}
export interface PlanDay {
    day: number;
    date: ISODate;
    timeSlots: PlanSlot[];
    terrainFacts?: {
        maxElevation?: number;
        totalAscent?: number;
        minElevation?: number;
        totalDescent?: number;
        effortLevel?: 'RELAX' | 'MODERATE' | 'CHALLENGE' | 'EXTREME';
        riskFlags?: Array<{
            type: string;
            severity: 'LOW' | 'MEDIUM' | 'HIGH';
            message: string;
        }>;
    };
}
export interface TripPlan {
    version: string;
    createdAt: string;
    days: PlanDay[];
    metrics?: {
        estTotalCost?: number;
        estActiveMinutes?: number;
        estTravelMinutes?: number;
        robustnessScore?: number;
    };
}
