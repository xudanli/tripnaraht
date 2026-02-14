import { PlanningPolicy } from '../interfaces/planning-policy.interface';
import { ReplanRequest, ReplanResult } from '../interfaces/replanner.interface';
import { DaySchedulerService } from './day-scheduler.service';
export declare class ReplannerService {
    private dayScheduler;
    constructor(dayScheduler: DaySchedulerService);
    private freezePrefix;
    private applyEventToPolicy;
    private buildPoiBanList;
    private extractRemainingPoiOrder;
    private buildCandidatePoiLists;
    private diffStops;
    replanRemaining(basePolicy: PlanningPolicy, req: ReplanRequest): Promise<ReplanResult>;
    private calculateMaxTimeShift;
    private buildStructuredExplanation;
}
