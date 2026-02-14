import { PrismaService } from '../../../prisma/prisma.service';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
import { DEMEffortMetadataService } from '../../dem/services/dem-effort-metadata.service';
export interface ElevationProfilePoint {
    distance: number;
    lat: number;
    lng: number;
    elevation: number;
    slope: number;
    cumulativeAscent: number;
    cumulativeEnergyCost: number;
}
export interface SteepSection {
    startDistance: number;
    endDistance: number;
    startIndex: number;
    endIndex: number;
    avgSlope: number;
    maxSlope: number;
    length: number;
    totalAscent: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface EnergyBreakpoint {
    distance: number;
    index: number;
    cumulativeEnergyCost: number;
    suggestedRestDuration: number;
    reason: string;
}
export interface MandatoryRestPoint {
    distance: number;
    index: number;
    elevation: number;
    consecutiveHighAltitudeDays?: number;
    consecutiveAscent?: number;
    reason: string;
    suggestedRestDuration: number;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface RouteSegmentation {
    elevationProfile: ElevationProfilePoint[];
    steepSections: SteepSection[];
    energyBreakpoints: EnergyBreakpoint[];
    mandatoryRestPoints: MandatoryRestPoint[];
    totalDistance: number;
    totalAscent: number;
    totalDescent: number;
    maxElevation: number;
    minElevation: number;
    avgSlope: number;
    maxSlope: number;
}
export interface SegmentationConfig {
    samplingInterval?: number;
    steepSlopeThreshold?: number;
    steepSectionMinLength?: number;
    energyBreakpointThreshold?: number;
    highAltitudeThreshold?: number;
    consecutiveAscentThreshold?: number;
    baseCostPerKm?: number;
    ascentFactor?: number;
}
export declare class DEMRouteSegmentationService {
    private readonly prisma;
    private readonly demElevationService?;
    private readonly demEffortService?;
    private readonly logger;
    constructor(prisma: PrismaService, demElevationService?: DEMElevationService, demEffortService?: DEMEffortMetadataService);
    segmentRoute(corridorGeom: any, config?: SegmentationConfig): Promise<RouteSegmentation>;
    private extractRoutePointsFromGeometry;
    private extractPointsFromWKT;
    private extractPointsFromGeoJSON;
    private extractPointsFromPostGIS;
    private resamplePoints;
    private generateElevationProfile;
    private identifySteepSections;
    private identifyEnergyBreakpoints;
    private identifyMandatoryRestPoints;
    private calculateStatistics;
    private calculateDistance;
    private toRadians;
}
