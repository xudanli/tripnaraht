export type HazardLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type HazardType = 'AVALANCHE' | 'MUDSLIDE' | 'FLOOD' | 'GLACIER_CREVASSE' | 'ROCKFALL' | 'OTHER';
export interface HazardZone {
    segmentId: string;
    level: HazardLevel;
    hazardType: HazardType;
    description?: string;
    metadata?: Record<string, any>;
}
