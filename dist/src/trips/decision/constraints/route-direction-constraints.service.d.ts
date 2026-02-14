import { TripWorldState, ActivityCandidate } from '../world-model';
export interface ConstraintViolation {
    type: 'hard' | 'soft';
    code: string;
    message: string;
    candidateId?: string;
    severity: 'critical' | 'warning';
    details?: Record<string, any>;
}
export declare class RouteDirectionConstraintsService {
    checkHardConstraints(state: TripWorldState, candidate: ActivityCandidate, dayElevation?: number, dayAscent?: number): ConstraintViolation[];
    checkSoftConstraints(state: TripWorldState, candidate: ActivityCandidate, dayElevation?: number, dayAscent?: number): ConstraintViolation[];
    calculateSoftConstraintPenalty(state: TripWorldState, candidate: ActivityCandidate, dayElevation?: number, dayAscent?: number): number;
    applyObjectiveWeights(state: TripWorldState, candidate: ActivityCandidate, baseScore: number): number;
}
