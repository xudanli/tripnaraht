import { DayScheduleResult } from '../../planning-policy/interfaces/scheduler.interface';
export declare class ScheduleResponseDto {
    date: string;
    schedule: DayScheduleResult | null;
    persisted: boolean;
}
export declare class SaveScheduleDto {
    schedule: DayScheduleResult;
}
