export interface OpeningHoursWindow {
    dayOfWeek?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
    start: string;
    end: string;
    holidayDates?: string[];
    holidaysOnly?: boolean;
}
export interface OpeningHours {
    windows: OpeningHoursWindow[];
    lastEntry?: string;
    lastEntryByDay?: Record<0 | 1 | 2 | 3 | 4 | 5 | 6, string>;
    closedDates?: string[];
    timezone?: string;
}
export interface Poi {
    id: string;
    name: string;
    lat: number;
    lng: number;
    tags: string[];
    openingHours?: OpeningHours;
    avgVisitMin: number;
    visitMinStd?: number;
    queueMinMean?: number;
    queueMinStd?: number;
    wheelchairAccess?: boolean;
    stairsRequired?: boolean;
    seatingAvailable?: boolean;
    restroomNearby?: boolean;
    weatherSensitivity?: 0 | 1 | 2 | 3;
    crowdKey?: string;
}
