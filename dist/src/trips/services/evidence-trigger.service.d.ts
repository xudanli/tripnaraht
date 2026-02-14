import { EvidenceType } from '../dto/evidence.dto';
import { EvidenceCompletenessChecker } from './evidence-completeness-checker.service';
import { PrismaService } from '../../prisma/prisma.service';
export interface EvidenceFetchSuggestion {
    id: string;
    description: string;
    priority: 'HIGH' | 'MEDIUM' | 'LOW';
    evidenceTypes: EvidenceType[];
    affectedPoiIds: number[];
    estimatedTime: number;
    reason: string;
    canBatchFetch: boolean;
}
export interface EvidenceTriggerResult {
    hasMissingEvidence: boolean;
    completenessScore: number;
    suggestions: EvidenceFetchSuggestion[];
    bulkFetchSuggestion?: {
        evidenceTypes: EvidenceType[];
        affectedPoiIds: number[];
        estimatedTime: number;
        description: string;
    };
}
export declare class EvidenceTriggerService {
    private readonly completenessChecker;
    private readonly prisma;
    private readonly logger;
    constructor(completenessChecker: EvidenceCompletenessChecker, prisma: PrismaService);
    checkAndSuggest(tripId: string): Promise<EvidenceTriggerResult>;
    private getExistingEvidence;
    private generateSuggestions;
    private generateBulkFetchSuggestion;
    shouldAutoTrigger(tripId: string, threshold?: number): Promise<boolean>;
}
