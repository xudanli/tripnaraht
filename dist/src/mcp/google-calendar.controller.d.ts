import { GoogleCalendarService } from './google-calendar.service';
import { GoogleCalendarIntegrationService } from './google-calendar-integration.service';
import { CreateEventDto, UpdateEventDto, DeleteEventDto, ListEventsDto, FindEventDto, FindFreeSlotsDto, QuickAddDto } from './dto/google-calendar.dto';
export declare class GoogleCalendarController {
    private readonly googleCalendarService;
    private readonly integrationService;
    private readonly logger;
    constructor(googleCalendarService: GoogleCalendarService, integrationService: GoogleCalendarIntegrationService);
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listCalendars(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listEvents(query: ListEventsDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    createEvent(dto: CreateEventDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateEvent(eventId: string, dto: UpdateEventDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deleteEvent(eventId: string, dto: DeleteEventDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findEvent(dto: FindEventDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findFreeSlots(dto: FindFreeSlotsDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    quickAdd(dto: QuickAddDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCurrentDateTime(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    syncTripToCalendar(tripId: string, body: {
        userId: string;
        calendarId?: string;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deleteTripEvents(tripId: string, body: {
        userId: string;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
