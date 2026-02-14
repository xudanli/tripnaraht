import { HallucinationDetectionResult } from '../interfaces/hallucination-detection.interface';
import { SourceAnnotationService } from '../../data-quality/services/source-annotation.service';
export declare class HallucinationDetectionService {
    private readonly sourceAnnotationService?;
    private readonly logger;
    private readonly MINIMUM_RELIABILITY_THRESHOLD;
    constructor(sourceAnnotationService?: SourceAnnotationService);
    detectHallucinations(output: any, context?: any): Promise<HallucinationDetectionResult>;
    private extractFactualClaims;
    private verifySources;
    private annotateConfidence;
    private markHallucinations;
    private generateUserNotification;
    private splitIntoSentences;
    private classifyClaimType;
    private extractEntities;
    private extractClaimsFromObject;
    private searchReliableSources;
    private isOutdated;
    private removeHallucinations;
}
