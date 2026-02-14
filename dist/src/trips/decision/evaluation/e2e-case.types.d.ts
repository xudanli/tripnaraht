import { DecisionLogEntry } from '../shared/decision-result.types';
export interface UserProfile {
    pacePreference?: 'SLOW' | 'MEDIUM' | 'FAST';
    altitudeTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
    travelPhilosophy?: string;
    preferredRouteTypes?: string[];
}
export interface E2ECaseInput {
    userProfile: UserProfile;
    season: number;
    countryCode: string;
    userQuery: string;
}
export interface AbuExpected {
    action: 'ALLOW' | 'REJECT';
    reasonCodes?: string[];
    violations?: string[];
}
export interface DrDreExpected {
    mustAdjust: boolean;
    adjustmentTypes?: ('SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE')[];
}
export interface NeptuneExpected {
    mustRepair: boolean;
    replacementTypes?: ('ENTRY' | 'POI' | 'SEGMENT')[];
}
export interface FinalStateExpected {
    allowed: boolean;
    planDays?: number;
}
export interface E2ECaseExpected {
    routeDirectionId?: string;
    routeDirectionTags?: string[];
    abuExpected: AbuExpected;
    drdreExpected?: DrDreExpected;
    neptuneExpected?: NeptuneExpected;
    finalState: FinalStateExpected;
}
export interface E2ECaseMetadata {
    tags?: string[];
    priority?: 'P0' | 'P1' | 'P2';
    source?: string;
    description?: string;
}
export interface E2ECase {
    id: string;
    name: string;
    description: string;
    input: E2ECaseInput;
    expected: E2ECaseExpected;
    metadata?: E2ECaseMetadata;
}
export interface E2EActualResult {
    routeDirectionId?: string;
    logs: DecisionLogEntry[];
    finalPlan?: {
        days: number;
        allowed: boolean;
    };
}
export interface E2EDiff {
    abuDiff?: string[];
    drdreDiff?: string[];
    neptuneDiff?: string[];
    routeDirectionDiff?: string;
    finalStateDiff?: string;
    hasDiff: boolean;
}
export interface E2EReplayResult {
    case: E2ECase;
    actual: E2EActualResult;
    diff: E2EDiff;
    passed: boolean;
    executionTime?: number;
}
