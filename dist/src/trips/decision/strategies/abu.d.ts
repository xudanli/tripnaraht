import { ActivityCandidate, TripWorldState } from '../world-model';
export interface AbuPickResult {
    kept: ActivityCandidate[];
    dropped: ActivityCandidate[];
    reasonsById: Record<string, string[]>;
}
export declare function abuSelectCoreActivities(state: TripWorldState, date: string, candidates: ActivityCandidate[], limits: {
    maxActiveMin: number;
    maxCost?: number;
}): AbuPickResult;
