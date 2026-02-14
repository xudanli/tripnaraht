import { ReadinessCheckResult } from '../types/readiness-findings.types';
import { CheckerViolation } from '../../decision/constraints/constraint-checker';
import { ConstraintViolation } from '../../decision/decision-log';
import { ISODate } from '../../decision/world-model';
export interface ReadinessConstraint {
    id: string;
    type: 'hard' | 'soft';
    severity: 'error' | 'warning' | 'info';
    constraintType?: 'legal_blocker' | 'safety_blocker' | 'strong_recommendation' | 'recommendation' | 'optional';
    message: string;
    predicate?: (state: any) => boolean;
    penalty?: (state: any) => number;
    evidence?: Array<{
        sourceId: string;
        sectionId?: string;
        quote?: string;
    }>;
    tasks?: Array<{
        title: string;
        dueOffsetDays?: number;
        tags?: string[];
    }>;
    askUser?: string[];
}
export declare class ReadinessToConstraintsCompiler {
    compile(result: ReadinessCheckResult): ReadinessConstraint[];
    toConstraintViolations(result: ReadinessCheckResult): ConstraintViolation[];
    toCheckerViolations(result: ReadinessCheckResult, date?: ISODate): CheckerViolation[];
    extractTasks(result: ReadinessCheckResult): Array<{
        title: string;
        dueOffsetDays: number;
        tags: string[];
        destinationId: string;
        category: string;
    }>;
}
