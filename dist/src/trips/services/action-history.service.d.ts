import { PrismaService } from '../../prisma/prisma.service';
import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';
import { AssistantAction } from '../../assist/dto/action.dto';
export interface ActionHistory {
    id: string;
    tripId: string;
    dateISO: string;
    actionType: string;
    action: AssistantAction;
    scheduleBefore: DayScheduleResult;
    scheduleAfter: DayScheduleResult;
    timestamp: Date;
    userId?: string;
}
export declare class ActionHistoryService {
    private prisma;
    constructor(prisma: PrismaService);
    recordAction(tripId: string, dateISO: string, action: AssistantAction, scheduleBefore: DayScheduleResult, scheduleAfter: DayScheduleResult): Promise<string>;
    getActionHistory(tripId: string, dateISO?: string): Promise<ActionHistory[]>;
    undoAction(tripId: string, dateISO: string): Promise<DayScheduleResult | null>;
    redoAction(tripId: string, dateISO: string): Promise<DayScheduleResult | null>;
}
