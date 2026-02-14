import { ActivityCandidate, TripWorldState, ISODate, GeoPoint } from '../world-model';
export interface CandidatePoolConfig {
    maxCandidatesPerDay: number;
    maxDistanceKm?: number;
    preferIndoor?: boolean;
    preferNearby?: boolean;
}
export interface SubstitutionSet {
    groupId: string;
    candidates: ActivityCandidate[];
    reason: string;
}
export declare class CandidatePoolService {
    generateDailyCandidates(state: TripWorldState, date: ISODate, centerPoint?: GeoPoint, config?: CandidatePoolConfig): ActivityCandidate[];
    generateSubstitutionSets(candidates: ActivityCandidate[], baseCandidate: ActivityCandidate): SubstitutionSet[];
    assignAlternativeGroups(candidates: ActivityCandidate[]): ActivityCandidate[];
    private scoreAndSort;
    private calculateScore;
    private calculateDistance;
    private toRad;
}
