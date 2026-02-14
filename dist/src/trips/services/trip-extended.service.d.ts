import { PrismaService } from '../../prisma/prisma.service';
import { CreateTripShareDto } from '../dto/trip-share.dto';
import { AddCollaboratorDto } from '../dto/trip-collaborator.dto';
export declare class TripExtendedService {
    private prisma;
    constructor(prisma: PrismaService);
    createShare(tripId: string, dto: CreateTripShareDto): Promise<{
        id: string;
        tripId: string;
        shareToken: string;
        permission: string;
        expiresAt: Date;
        shareUrl: string;
        createdAt: Date;
    }>;
    addCollaborator(tripId: string, dto: AddCollaboratorDto): Promise<{
        id: string;
        tripId: string;
        userId: string;
        role: string;
        createdAt: Date;
    }>;
    getTripByShareToken(shareToken: string): Promise<{
        trip: {
            TripDay: ({
                ItineraryItem: ({
                    Place: {
                        id: number;
                        uuid: string;
                        nameEN: string | null;
                        category: import(".prisma/client").$Enums.PlaceCategory;
                        address: string | null;
                        cityId: number | null;
                        metadata: import("@prisma/client/runtime/library").JsonValue | null;
                        physicalMetadata: import("@prisma/client/runtime/library").JsonValue | null;
                        googlePlaceId: string | null;
                        rating: number | null;
                        createdAt: Date;
                        updatedAt: Date;
                        nameCN: string;
                        description: string | null;
                        lastVerifiedAt: Date | null;
                        dataSource: string | null;
                        dataFreshness: string | null;
                    };
                    Trail: {
                        TrailWaypoint: ({
                            Place: {
                                id: number;
                                uuid: string;
                                nameEN: string | null;
                                category: import(".prisma/client").$Enums.PlaceCategory;
                                address: string | null;
                                cityId: number | null;
                                metadata: import("@prisma/client/runtime/library").JsonValue | null;
                                physicalMetadata: import("@prisma/client/runtime/library").JsonValue | null;
                                googlePlaceId: string | null;
                                rating: number | null;
                                createdAt: Date;
                                updatedAt: Date;
                                nameCN: string;
                                description: string | null;
                                lastVerifiedAt: Date | null;
                                dataSource: string | null;
                                dataFreshness: string | null;
                            };
                        } & {
                            id: number;
                            placeId: number;
                            note: string | null;
                            trailId: number;
                            order: number;
                        })[];
                        Place_Trail_endPlaceIdToPlace: {
                            id: number;
                            uuid: string;
                            nameEN: string | null;
                            category: import(".prisma/client").$Enums.PlaceCategory;
                            address: string | null;
                            cityId: number | null;
                            metadata: import("@prisma/client/runtime/library").JsonValue | null;
                            physicalMetadata: import("@prisma/client/runtime/library").JsonValue | null;
                            googlePlaceId: string | null;
                            rating: number | null;
                            createdAt: Date;
                            updatedAt: Date;
                            nameCN: string;
                            description: string | null;
                            lastVerifiedAt: Date | null;
                            dataSource: string | null;
                            dataFreshness: string | null;
                        };
                        Place_Trail_startPlaceIdToPlace: {
                            id: number;
                            uuid: string;
                            nameEN: string | null;
                            category: import(".prisma/client").$Enums.PlaceCategory;
                            address: string | null;
                            cityId: number | null;
                            metadata: import("@prisma/client/runtime/library").JsonValue | null;
                            physicalMetadata: import("@prisma/client/runtime/library").JsonValue | null;
                            googlePlaceId: string | null;
                            rating: number | null;
                            createdAt: Date;
                            updatedAt: Date;
                            nameCN: string;
                            description: string | null;
                            lastVerifiedAt: Date | null;
                            dataSource: string | null;
                            dataFreshness: string | null;
                        };
                    } & {
                        id: number;
                        uuid: string;
                        nameEN: string | null;
                        metadata: import("@prisma/client/runtime/library").JsonValue | null;
                        rating: number | null;
                        createdAt: Date;
                        updatedAt: Date;
                        nameCN: string;
                        description: string | null;
                        distanceKm: number | null;
                        elevationGainM: number | null;
                        elevationLossM: number | null;
                        maxElevationM: number | null;
                        minElevationM: number | null;
                        averageSlope: number | null;
                        difficultyLevel: string | null;
                        equivalentDistanceKm: number | null;
                        fatigueScore: number | null;
                        gpxData: import("@prisma/client/runtime/library").JsonValue | null;
                        gpxFileUrl: string | null;
                        bounds: import("@prisma/client/runtime/library").JsonValue | null;
                        startPlaceId: number | null;
                        endPlaceId: number | null;
                        source: string | null;
                        sourceUrl: string | null;
                        estimatedDurationHours: number | null;
                    };
                } & {
                    id: string;
                    type: import(".prisma/client").$Enums.ItemType;
                    placeId: number | null;
                    startTime: Date | null;
                    endTime: Date | null;
                    tripDayId: string;
                    note: string | null;
                    trailId: number | null;
                    actualCost: number | null;
                    costCategory: string | null;
                    costNote: string | null;
                    currency: string | null;
                    estimatedCost: number | null;
                    isPaid: boolean;
                    paidBy: string | null;
                    bookedAt: Date | null;
                    bookingConfirmation: string | null;
                    bookingStatus: string | null;
                    bookingUrl: string | null;
                    travelFromPreviousDistance: number | null;
                    travelFromPreviousDuration: number | null;
                    travelMode: string | null;
                    order: number | null;
                })[];
            } & {
                id: string;
                date: Date;
                tripId: string;
            })[];
        } & {
            status: string | null;
            id: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            createdAt: Date;
            updatedAt: Date;
            name: string | null;
            destination: string;
            startDate: Date;
            endDate: Date;
            budgetConfig: import("@prisma/client/runtime/library").JsonValue | null;
            pacingConfig: import("@prisma/client/runtime/library").JsonValue | null;
        };
        permission: string;
        shareToken: string;
    }>;
    importTripFromShare(shareToken: string, newTripData: {
        destination: string;
        startDate: string;
        endDate: string;
        userId?: string;
    }): Promise<{
        tripId: string;
        importedFrom: string;
        message: string;
    }>;
    getCollaborators(tripId: string): Promise<{
        id: string;
        tripId: string;
        userId: string;
        role: string;
        createdAt: Date;
    }[]>;
    removeCollaborator(tripId: string, userId: string): Promise<{
        success: boolean;
    }>;
    collectTrip(tripId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    uncollectTrip(tripId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    likeTrip(tripId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    unlikeTrip(tripId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    } | {
        success: boolean;
        message?: undefined;
    }>;
    getFeaturedTrips(limit?: number): Promise<{
        likeCount: number;
        collectionCount: number;
        popularityScore: number;
        _count: {
            TripCollection: number;
            TripLike: number;
        };
        TripCollection: {
            id: string;
            createdAt: Date;
            tripId: string;
            userId: string;
        }[];
        TripLike: {
            id: string;
            createdAt: Date;
            tripId: string;
            userId: string;
        }[];
        status: string | null;
        id: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        updatedAt: Date;
        name: string | null;
        destination: string;
        startDate: Date;
        endDate: Date;
        budgetConfig: import("@prisma/client/runtime/library").JsonValue | null;
        pacingConfig: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    exportOfflinePack(tripId: string): Promise<{
        tripId: string;
        version: number;
        data: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
        updatedAt: Date;
    }>;
    getOfflinePackStatus(tripId: string): Promise<{
        exists: boolean;
        tripId?: undefined;
        version?: undefined;
        createdAt?: undefined;
        updatedAt?: undefined;
    } | {
        exists: boolean;
        tripId: string;
        version: number;
        createdAt: Date;
        updatedAt: Date;
    }>;
    syncOfflineChanges(tripId: string, offlineData: any): Promise<{
        success: boolean;
        message: string;
        syncedAt: Date;
    }>;
}
