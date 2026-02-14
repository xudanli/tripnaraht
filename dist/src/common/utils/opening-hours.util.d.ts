export declare class OpeningHoursUtil {
    static isOpenNow(hoursStr: string, timezone?: string): boolean;
    private static parseTimeToMinutes;
    static getTodayHours(metadata: any, timezone?: string): string;
    static isOpenAt(hoursStr: string, checkDate: Date, timezone?: string): boolean;
    static getHoursForDate(metadata: any, checkDate: Date, timezone?: string): string;
}
