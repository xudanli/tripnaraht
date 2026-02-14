export declare class DateTimeDto {
    dateTime?: string;
    date?: string;
    timeZone?: string;
}
export declare class CreateEventDto {
    calendarId?: string;
    summary: string;
    start: DateTimeDto;
    end: DateTimeDto;
    description?: string;
    location?: string;
    attendees?: string[];
}
export declare class UpdateEventDto {
    calendarId: string;
    eventId: string;
    summary?: string;
    start?: DateTimeDto;
    end?: DateTimeDto;
    description?: string;
    location?: string;
}
export declare class DeleteEventDto {
    calendarId: string;
    eventId: string;
}
export declare class ListEventsDto {
    calendarId?: string;
    timeMin?: string;
    timeMax?: string;
    maxResults?: number;
}
export declare class FindEventDto {
    calendarId?: string;
    query?: string;
    timeMin?: string;
    timeMax?: string;
}
export declare class FindFreeSlotsDto {
    calendarId?: string;
    timeMin: string;
    timeMax: string;
    durationMinutes?: number;
}
export declare class QuickAddDto {
    calendarId?: string;
    text: string;
}
