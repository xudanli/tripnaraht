import { EvidenceType } from '../dto/evidence.dto';
import { Place } from '@prisma/client';
export interface EvidenceCompletenessResult {
    completenessScore: number;
    missingEvidence: Array<{
        poiId: number;
        poiName: string;
        missingTypes: EvidenceType[];
        impact: 'LOW' | 'MEDIUM' | 'HIGH';
        reason: string;
    }>;
    recommendations: Array<{
        action: string;
        priority: 'HIGH' | 'MEDIUM' | 'LOW';
        estimatedTime: number;
        evidenceTypes: EvidenceType[];
        affectedPois: number[];
    }>;
}
export declare class EvidenceCompletenessChecker {
    private readonly logger;
    private readonly CATEGORY_EVIDENCE_MAP;
    private readonly CANONICAL_TYPE_EVIDENCE_MAP;
    checkCompleteness(places: Place[], existingEvidence: Array<{
        poiId?: string;
        type: EvidenceType;
    }>, tripStartDate?: string): EvidenceCompletenessResult;
    private buildEvidenceMap;
    private getExpectedEvidenceTypes;
    private isWinterSeason;
    private calculateImpact;
    private getMissingReason;
    private generateRecommendations;
    private estimateFetchTime;
    private getActionDescription;
}
