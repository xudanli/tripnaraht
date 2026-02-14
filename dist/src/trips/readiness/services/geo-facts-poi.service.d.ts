import { PrismaService } from '../../../prisma/prisma.service';
import { PickupPoint } from './poi-pickup-scorer.service';
import { TrailAccessPoint } from './poi-trailhead.service';
import { DEMElevationService } from '../../dem/services/dem-elevation.service';
export interface POIFeatures {
    topPickupPoints: PickupPoint[];
    hasHarbour: boolean;
    trailAccessPoints: TrailAccessPoint[];
    safety: {
        hasHospital: boolean;
        hasClinic: boolean;
        hasPharmacy: boolean;
        hasPolice: boolean;
        hasFireStation: boolean;
    };
    supply: {
        hasFuel: boolean;
        hasSupermarket: boolean;
        hasConvenience: boolean;
        hasCarRepair: boolean;
        hasEVCharger: boolean;
    };
    information: {
        hasInformationPoint: boolean;
        hasViewpoint: boolean;
    };
    xizang?: {
        oxygenStationCount: number;
        checkpointCount: number;
        mountainPassCount: number;
        avgAltitudeM: number | null;
        fuelDensity: number | null;
    };
}
export interface Point {
    lat: number;
    lng: number;
}
export interface Route {
    points: Point[];
}
export declare class GeoFactsPOIService {
    private readonly prisma;
    private readonly demElevationService?;
    private readonly logger;
    private readonly pickupScorer;
    private readonly trailheadService;
    constructor(prisma: PrismaService, demElevationService?: DEMElevationService);
    getPOIFeaturesForPoint(lat: number, lng: number, radiusKm?: number, pickupLimit?: number): Promise<POIFeatures>;
    getPOIFeaturesForRoute(route: Route, radiusKm?: number, pickupLimit?: number): Promise<POIFeatures>;
    private checkSafetyPoints;
    private checkSupplyPoints;
    private checkInformationPoints;
    private checkXizangFeatures;
}
