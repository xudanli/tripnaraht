import { PrismaService } from '../prisma/prisma.service';
import { GoogleCalendarService } from './google-calendar.service';
import { RedisService } from '../redis/redis.service';
export interface SyncTripResult {
    success: boolean;
    eventsCreated: number;
    eventsUpdated: number;
    eventsDeleted: number;
    errors: Array<{
        itemId: string;
        error: string;
    }>;
}
export interface CalendarEventMapping {
    tripId: string;
    itineraryItemId: string;
    calendarId: string;
    eventId: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare class GoogleCalendarIntegrationService {
    private readonly prisma;
    private readonly googleCalendarService?;
    private readonly redisService?;
    private readonly logger;
    constructor(prisma: PrismaService, googleCalendarService?: GoogleCalendarService, redisService?: RedisService);
    syncTripToCalendar(tripId: string, userId: string, calendarId?: string): Promise<SyncTripResult>;
    deleteTripEvents(tripId: string): Promise<SyncTripResult>;
    checkUserAvailability(timeMin: string, timeMax: string, durationMinutes?: number, calendarId?: string): Promise<any>;
    private getEventSummary;
    private getEventDescription;
    private getEventMappings;
    private saveEventMapping;
    private updateEventMapping;
    private deleteEventMapping;
}
