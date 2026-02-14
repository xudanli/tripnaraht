import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class AirbnbService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    private readonly configDir;
    private readonly connectionIdFile;
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    private getClient;
    searchListings(params: {
        location: string;
        adults?: number;
        children?: number;
        infants?: number;
        pets?: number;
        checkin?: string;
        checkout?: string;
        page?: number;
        ignoreRobotsText?: boolean;
    }): Promise<any>;
    getListingDetails(params: {
        listingId: string;
        checkin?: string;
        checkout?: string;
        adults?: number;
        children?: number;
        infants?: number;
        pets?: number;
        ignoreRobotsText?: boolean;
    }): Promise<any>;
    getListingPhotos(listingId: string): Promise<void>;
    analyzeListingPhotos(listingId: string): Promise<void>;
    listTools(): Promise<any>;
    checkAuthStatus(): Promise<{
        isAuthorized: boolean;
        authorizationUrl?: string;
        connectionId?: string;
    }>;
    getAuthorizationUrl(): Promise<{
        authorizationUrl: string;
        connectionId: string;
    }>;
    verifyAuthorization(connectionId: string): Promise<{
        isAuthorized: boolean;
        message?: string;
    }>;
}
