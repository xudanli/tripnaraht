import { RailPassProfile, RailSegment } from '../interfaces/railpass.interface';
export type CoverageStatus = 'COVERED' | 'NOT_COVERED' | 'PARTIAL' | 'UNKNOWN';
export interface CoverageCheckResult {
    covered: boolean;
    status: CoverageStatus;
    explanation: string;
    includesCityTransport: boolean;
    alternatives?: Array<{
        type: 'METRO' | 'BUS' | 'TAXI' | 'WALK';
        description: string;
        estimatedCost?: number;
        estimatedTimeMinutes?: number;
    }>;
}
export declare class PassCoverageCheckerService {
    private readonly logger;
    checkCoverage(segment: RailSegment, passProfile: RailPassProfile): CoverageCheckResult;
    private checkGlobalPassCoverage;
    private isCityTransport;
    private checkOperatorCoverage;
    private generateCityTransportAlternatives;
}
