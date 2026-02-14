import { TravelerDto, UserContext, TripType, PlanningPolicy } from '../interfaces/planning-policy.interface';
export declare class PolicyCompilerService {
    compilePlanningPolicy(args: {
        travelers: TravelerDto[];
        context: UserContext;
        tripType: TripType;
        totalBudgetCny?: number;
        days?: number;
        people?: number;
    }): PlanningPolicy;
}
