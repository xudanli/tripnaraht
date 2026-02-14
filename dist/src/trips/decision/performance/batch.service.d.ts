import { TripWorldState } from '../world-model';
import { TripPlan } from '../plan-model';
export declare class BatchProcessingService {
    private readonly logger;
    batchGeneratePlans(states: TripWorldState[], generator: (state: TripWorldState) => Promise<{
        plan: TripPlan;
        log: any;
    }>): Promise<Array<{
        state: TripWorldState;
        plan: TripPlan;
        log: any;
    }>>;
    batchCheckConstraints(plans: Array<{
        plan: TripPlan;
        state: TripWorldState;
    }>, checker: (state: TripWorldState, plan: TripPlan) => any): Promise<Array<{
        plan: TripPlan;
        result: any;
    }>>;
    batchEvaluate(plans: Array<{
        plan: TripPlan;
        state: TripWorldState;
        constraintResult: any;
    }>, evaluator: (state: TripWorldState, plan: TripPlan, constraintResult: any) => any): Promise<Array<{
        plan: TripPlan;
        metrics: any;
    }>>;
}
