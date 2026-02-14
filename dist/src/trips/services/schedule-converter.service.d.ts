import { PrismaService } from '../../prisma/prisma.service';
import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';
export declare class ScheduleConverterService {
    private prisma;
    constructor(prisma: PrismaService);
    saveScheduleToDatabase(tripId: string, tripDayId: string, schedule: DayScheduleResult, dateISO: string): Promise<{
        id: `${string}-${string}-${string}-${string}-${string}`;
        tripDayId: string;
        placeId: number;
        type: string;
        startTime: Date;
        endTime: Date;
        note: string;
        order: number;
    }[]>;
    loadScheduleFromDatabase(tripDayId: string, dateISO: string): Promise<DayScheduleResult | null>;
    private mapStopKindToItemType;
    private extractLat;
    private extractLng;
    private extractCoordinates;
}
