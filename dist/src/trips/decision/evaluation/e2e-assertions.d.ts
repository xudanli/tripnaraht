import { DecisionLogEntry } from '../shared/decision-result.types';
import { AbuExpected, DrDreExpected, NeptuneExpected, E2EDiff } from './e2e-case.types';
export declare function assertAbuBehavior(logs: DecisionLogEntry[], expected: AbuExpected): {
    passed: boolean;
    diff: string[];
};
export declare function assertDrDreBehavior(logs: DecisionLogEntry[], expected: DrDreExpected): {
    passed: boolean;
    diff: string[];
};
export declare function assertNeptuneBehavior(logs: DecisionLogEntry[], expected: NeptuneExpected): {
    passed: boolean;
    diff: string[];
};
export declare function analyzeDiff(expected: {
    abuExpected: AbuExpected;
    drdreExpected?: DrDreExpected;
    neptuneExpected?: NeptuneExpected;
    routeDirectionId?: string;
    finalState: {
        allowed: boolean;
        planDays?: number;
    };
}, actual: {
    logs: DecisionLogEntry[];
    routeDirectionId?: string;
    finalPlan?: {
        days: number;
        allowed: boolean;
    };
}): E2EDiff;
