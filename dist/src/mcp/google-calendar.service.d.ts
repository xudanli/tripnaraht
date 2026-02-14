import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
export declare class GoogleCalendarService implements OnModuleInit, OnModuleDestroy {
    private readonly logger;
    private client;
    private isConnected;
    constructor();
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    private ensureConnected;
    listTools(): Promise<any>;
    listEvents(params?: {
        calendarId?: string;
        timeMin?: string;
        timeMax?: string;
        maxResults?: number;
    }): Promise<any>;
    createEvent(params: {
        calendarId?: string;
        summary: string;
        start: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        end: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        description?: string;
        location?: string;
        attendees?: Array<{
            email: string;
        }>;
    }): Promise<any>;
    deleteEvent(params: {
        calendarId: string;
        eventId: string;
    }): Promise<any>;
    updateEvent(params: {
        calendarId: string;
        eventId: string;
        summary?: string;
        start?: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        end?: {
            dateTime: string;
            timeZone?: string;
        } | {
            date: string;
        };
        description?: string;
        location?: string;
    }): Promise<any>;
    findEvent(params: {
        calendarId?: string;
        query?: string;
        timeMin?: string;
        timeMax?: string;
    }): Promise<any>;
    getCurrentDateTime(): Promise<any>;
    findFreeSlots(params: {
        calendarId?: string;
        timeMin: string;
        timeMax: string;
        durationMinutes?: number;
    }): Promise<any>;
    listCalendars(): Promise<any>;
    quickAdd(params: {
        calendarId?: string;
        text: string;
    }): Promise<any>;
}
