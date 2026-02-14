export interface TransportSchedule {
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
    departures: DepartureTime[];
    lastUpdated: Date;
    source: string;
    metadata?: Record<string, any>;
}
export interface DepartureTime {
    departureTime: string;
    arrivalTime?: string;
    durationMinutes?: number;
    requiresReservation?: boolean;
    price?: {
        amount: number;
        currency: string;
        currencyCode: string;
    };
    status?: 'scheduled' | 'delayed' | 'cancelled' | 'unknown';
    delayMinutes?: number;
    platform?: string;
}
export interface TransportQuery {
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
    limit?: number;
}
