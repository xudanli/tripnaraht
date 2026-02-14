import { ActivityCandidate } from '../world-model';
import { PlanDay } from '../plan-model';
export interface MutexGroup {
    groupId: string;
    maxSelect: number;
    description?: string;
}
export interface Dependency {
    from: string;
    to: string;
    type: 'before' | 'after' | 'same_day' | 'adjacent';
    minGapMinutes?: number;
}
export interface AdvancedConstraints {
    mutexGroups: MutexGroup[];
    dependencies: Dependency[];
}
export declare class AdvancedConstraintsService {
    private readonly logger;
    checkMutexGroups(plan: {
        days: PlanDay[];
    }, constraints: AdvancedConstraints): Array<{
        groupId: string;
        violations: string[];
        message: string;
    }>;
    checkDependencies(plan: {
        days: PlanDay[];
    }, constraints: AdvancedConstraints): Array<{
        dependency: Dependency;
        message: string;
    }>;
    applyConstraintsToCandidates(candidates: ActivityCandidate[], constraints: AdvancedConstraints): ActivityCandidate[];
    private applyMutexGroups;
    private getGroupId;
    private timeToMinutes;
}
