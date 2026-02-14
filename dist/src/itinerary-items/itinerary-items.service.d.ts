import { PrismaService } from '../prisma/prisma.service';
import { CreateItineraryItemDto } from './dto/create-itinerary-item.dto';
import { SmartRoutesService } from '../transport/services/smart-routes.service';
import { PlacesService } from '../places/places.service';
import { GoogleMapsDirectService } from '../mcp/google-maps-direct.service';
import { SearchNearbyPoiQueryDto, NearbyPoiResultDto } from './dto/search-nearby-poi.dto';
export declare class ItineraryItemsService {
    private prisma;
    private readonly smartRoutesService?;
    private readonly placesService?;
    private readonly googleMapsService?;
    constructor(prisma: PrismaService, smartRoutesService?: SmartRoutesService, placesService?: PlacesService, googleMapsService?: GoogleMapsDirectService);
    create(dto: CreateItineraryItemDto): Promise<any>;
    private inferItemType;
    findAll(): Promise<any[]>;
    findOne(id: string): Promise<any>;
    findByTripDay(tripDayId: string): Promise<any[]>;
    private findCheckoutItemsForDay;
    private addCrossDayInfo;
    private getTimeLabels;
    update(id: string, updateDto: Partial<CreateItineraryItemDto> & {
        cascadeMode?: 'auto' | 'none';
    }, options?: {
        forceUpdate?: boolean;
    }): Promise<any>;
    private adjustSubsequentItemsBasedOnTravelTime;
    private extractPlaceCoordinates;
    private extractPlaceCoordinatesAsync;
    private enrichItemWithCoordinates;
    private getPlaceCoordinates;
    private calculateHaversineDistance;
    private toRadians;
    remove(id: string): Promise<{
        id: string;
        type: import(".prisma/client").$Enums.ItemType;
        placeId: number | null;
        startTime: Date | null;
        endTime: Date | null;
        tripDayId: string;
        note: string | null;
        trailId: number | null;
        order: number | null;
        estimatedCost: number | null;
        actualCost: number | null;
        currency: string | null;
        costCategory: string | null;
        costNote: string | null;
        isPaid: boolean;
        paidBy: string | null;
        travelFromPreviousDuration: number | null;
        travelFromPreviousDistance: number | null;
        travelMode: string | null;
        bookingStatus: string | null;
        bookingConfirmation: string | null;
        bookingUrl: string | null;
        bookedAt: Date | null;
    }>;
    calculateTravelInfoForItem(itemId: string, tripId: string): Promise<{
        itemId: string;
        fromPlace: any;
        toPlace: any;
        duration: number;
        distance: number;
        travelMode: string;
        crossDay: boolean;
    }>;
    calculateAllTravelInfo(tripId: string, defaultTravelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT'): Promise<{
        tripId: string;
        totalDays: number;
        totalItems: number;
        calculatedCount: number;
        crossDaySegments: number;
        results: {
            itemId: string;
            fromPlace: string;
            toPlace: string;
            duration: number | null;
            distance: number | null;
            travelMode: string;
            crossDay: boolean;
            calculated: boolean;
            error?: string;
        }[];
        summary: {
            totalDuration: number;
            totalDistance: number;
            successRate: number;
        };
    }>;
    calculateAndSaveTravelInfo(tripId: string, dayId: string, defaultTravelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT'): Promise<{
        dayId: string;
        date: Date;
        itemCount: number;
        calculatedCount: number;
        results: {
            itemId: string;
            fromPlace: string;
            toPlace: string;
            duration: number | null;
            distance: number | null;
            travelMode: string;
            calculated: boolean;
            error?: string;
        }[];
        summary: {
            totalDuration: number;
            totalDistance: number;
            successRate: number;
        };
    }>;
    private estimateDuration;
    getDayTravelInfo(tripId: string, dayId: string): Promise<{
        dayId: string;
        date: Date;
        itemCount: number;
        segments: {
            fromItemId: string;
            toItemId: string;
            fromPlace: string;
            toPlace: string;
            duration: number | null;
            distance: number | null;
            travelMode: string | null;
        }[];
        summary: {
            totalDuration: number;
            totalDistance: number;
            segmentCount: number;
        };
    }>;
    updateBookingStatus(id: string, bookingData: {
        bookingStatus?: 'BOOKED' | 'NEED_BOOKING' | 'NO_BOOKING';
        bookingConfirmation?: string;
        bookingUrl?: string;
        bookedAt?: string;
    }): Promise<any>;
    fixItemDateConsistency(tripId: string): Promise<{
        tripId: string;
        totalDays: number;
        fixedCount: number;
        fixes: {
            itemId: string;
            placeName: string;
            oldStartTime: string;
            newStartTime: string;
            fixed: boolean;
        }[];
    }>;
    updateTravelInfo(id: string, travelData: {
        travelFromPreviousDuration?: number;
        travelFromPreviousDistance?: number;
        travelMode?: 'DRIVING' | 'WALKING' | 'TRANSIT' | 'FLIGHT' | 'TRAIN' | 'FERRY' | 'BICYCLE' | 'TAXI';
    }): Promise<any>;
    searchNearbyPoi(query: SearchNearbyPoiQueryDto): Promise<NearbyPoiResultDto[]>;
    private calculateDistance;
    private toRad;
    private formatTime;
}
