import { EvidenceItemDto, EvidenceConfidenceDto } from '../dto/evidence.dto';
export declare class EvidenceConfidenceCalculator {
    private readonly logger;
    private readonly SOURCE_RELIABILITY_MAP;
    calculateConfidence(item: EvidenceItemDto): EvidenceConfidenceDto;
    private getSourceReliability;
    private getFreshnessScore;
    private getCompletenessScore;
}
