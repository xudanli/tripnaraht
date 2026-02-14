export interface FerrySchedule {
    route: string;
    routeName?: string;
    from: {
        name: string;
        code?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
    to: {
        name: string;
        code?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
    sailings: FerrySailing[];
    lastUpdated: Date;
    source: string;
    metadata?: Record<string, any>;
}
export interface FerrySailing {
    departureTime: string;
    arrivalTime?: string;
    durationMinutes?: number;
    requiresReservation?: boolean;
    price?: {
        amount: number;
        currency: string;
        currencyCode: string;
        vehicleIncluded?: boolean;
    };
    status?: 'scheduled' | 'delayed' | 'cancelled' | 'full' | 'unknown';
    delayMinutes?: number;
    availability?: {
        vehicles?: number;
        passengers?: number;
    };
    vessel?: {
        name?: string;
        capacity?: number;
    };
}
export interface FerryQuery {
    from: {
        name?: string;
        code?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
    to: {
        name?: string;
        code?: string;
        coordinates?: {
            lat: number;
            lng: number;
        };
    };
    departureDateTime?: string;
    withVehicle?: boolean;
    limit?: number;
}
