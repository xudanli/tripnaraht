import { PrismaService } from '../../prisma/prisma.service';
export interface IcelandPickupPoint {
    placeId: number;
    name: string;
    nameEN?: string;
    lat: number;
    lng: number;
    canonicalType: string;
    tags: Record<string, any>;
}
export interface IcelandAttraction {
    placeId: number;
    name: string;
    nameEN?: string;
    lat: number;
    lng: number;
    canonicalType: string;
    tags: Record<string, any>;
}
export interface IcelandGeoFeatures {
    transport: {
        airports: IcelandAttraction[];
        ferryTerminals: IcelandPickupPoint[];
        parking: IcelandAttraction[];
        hasAirport: boolean;
        hasFerryTerminal: boolean;
        totalTransportPoints: number;
    };
    attractions: {
        waterfalls: IcelandAttraction[];
        hotSprings: IcelandAttraction[];
        geysers: IcelandAttraction[];
        glaciers: IcelandAttraction[];
        volcanoes: IcelandAttraction[];
        beaches: IcelandAttraction[];
        viewpoints: IcelandAttraction[];
        totalAttractions: number;
    };
    safety: {
        hospitals: IcelandAttraction[];
        clinics: IcelandAttraction[];
        pharmacies: IcelandAttraction[];
        police: IcelandAttraction[];
        fireStations: IcelandAttraction[];
        hasHospital: boolean;
        hasClinic: boolean;
        hasPharmacy: boolean;
        totalSafetyPoints: number;
    };
    supply: {
        fuelStations: IcelandAttraction[];
        supermarkets: IcelandAttraction[];
        convenienceStores: IcelandAttraction[];
        toilets: IcelandAttraction[];
        hasFuel: boolean;
        hasSupermarket: boolean;
        hasConvenience: boolean;
        totalSupplyPoints: number;
    };
    services: {
        informationCenters: IcelandAttraction[];
        tourOperators: IcelandAttraction[];
        carRentals: IcelandAttraction[];
        camping: IcelandAttraction[];
        spaPools: IcelandAttraction[];
        totalServicePoints: number;
    };
}
export declare class IcelandPoiFeaturesService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getIcelandFeatures(region?: string): Promise<IcelandGeoFeatures>;
    private getTransportPoints;
    private getAttractions;
    private getSafetyPoints;
    private getSupplyPoints;
    private getServicePoints;
}
