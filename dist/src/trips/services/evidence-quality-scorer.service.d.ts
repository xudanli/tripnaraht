import { EvidenceItemDto, EvidenceQualityScoreDto } from '../dto/evidence.dto';
export declare class EvidenceQualityScorer {
    private readonly logger;
    private readonly SOURCE_RELIABILITY_MAP;
    calculateQualityScore(item: EvidenceItemDto): Promise<EvidenceQualityScoreDto>;
    private getSourceReliability;
    private calculateTimelinessScore;
    private calculateCompletenessScore;
    private generateExplanation;
}
