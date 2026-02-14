import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import { DayScheduleRequest, DayScheduleResult } from '../interfaces/scheduler.interface';
import { HpSimulatorService } from './hp-simulator.service';
export declare class DaySchedulerService {
    private hpSimulator;
    constructor(hpSimulator: HpSimulatorService);
    private poiUtility;
    private violatesPoiHardConstraints;
    private withinTimeWindow;
    private pickBestRestStop;
    scheduleDay(policy: PlanningPolicy, req: DayScheduleRequest): Promise<DayScheduleResult>;
}
