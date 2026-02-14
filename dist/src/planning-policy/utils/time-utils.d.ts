import { OpeningHours } from '../interfaces/poi.interface';
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export declare function hhmmToMin(hhmm: string): number;
export declare function minToHhmm(min: number): string;
export declare function isHoliday(dateISO: string): boolean;
export declare function isOpenAt(oh: OpeningHours | undefined, dayOfWeek: DayOfWeek, tMin: number, dateISO?: string): boolean;
export declare function latestEntryMin(oh: OpeningHours | undefined, dayOfWeek: DayOfWeek): number | undefined;
export declare function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number;
export declare function dayOfWeekFromISO(dateISO: string): DayOfWeek;
export type TimeWindowStatus = {
    ok: true;
    waitMin: number;
    status: 'OPEN' | 'WAIT_NEXT_WINDOW';
} | {
    ok: false;
    waitMin: 0;
    reason: 'CLOSED_DATE' | 'NO_WINDOW_TODAY' | 'MISSED_LAST_ENTRY' | 'CLOSED_REST_OF_DAY';
};
export declare function withinTimeWindowForEvaluation(args: {
    openingHours?: OpeningHours;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    arriveMin: number;
    holiday?: boolean;
}): TimeWindowStatus;
export interface EntryDeadlineInfo {
    entryMin: number;
    windowEndMin?: number;
    lastEntryMin?: number;
    deadlineMin?: number;
}
export declare function getEntryDeadlineInfoForEvaluation(args: {
    openingHours?: OpeningHours;
    dateISO: string;
    dayOfWeek: DayOfWeek;
    entryMin: number;
    holiday?: boolean;
}): EntryDeadlineInfo;
