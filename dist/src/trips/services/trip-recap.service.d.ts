import { PrismaService } from '../../prisma/prisma.service';
export interface TripRecapReport {
    tripId: string;
    destination: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    places: Array<{
        id: number;
        nameCN: string;
        nameEN?: string;
        category: string;
        visitDate: string;
        visitTime: string;
        photos?: string[];
    }>;
    trails: Array<{
        id: number;
        nameCN: string;
        nameEN?: string;
        distanceKm: number;
        elevationGainM: number;
        durationHours: number;
        visitDate: string;
        gpxData?: any;
        waypoints?: Array<{
            placeId?: number;
            placeName?: string;
            latitude: number;
            longitude: number;
            elevation?: number;
        }>;
    }>;
    statistics: {
        totalPlaces: number;
        totalTrails: number;
        totalTrailDistanceKm: number;
        totalElevationGainM: number;
        totalTrailDurationHours: number;
        placesByCategory: Record<string, number>;
    };
    timeline: Array<{
        date: string;
        items: Array<{
            type: 'PLACE' | 'TRAIL' | 'REST' | 'MEAL';
            name: string;
            time: string;
            duration?: number;
            note?: string;
        }>;
    }>;
    metadata?: {
        photos?: string[];
        notes?: string;
        rating?: number;
    };
}
export declare class TripRecapService {
    private prisma;
    constructor(prisma: PrismaService);
    generateRecap(tripId: string): Promise<TripRecapReport>;
    exportForSharing(tripId: string): Promise<{
        recap: TripRecapReport;
        shareUrl: string;
        exportDate: string;
    }>;
    generateTrailVideoData(tripId: string): Promise<{
        trails: Array<{
            trailId: number;
            name: string;
            gpxData: any;
            keyPoints: Array<{
                latitude: number;
                longitude: number;
                elevation: number;
                timestamp: string;
                description?: string;
            }>;
        }>;
    }>;
}
