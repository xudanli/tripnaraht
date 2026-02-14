import { EvidenceItemDto } from '../dto/evidence.dto';
import { Place } from '@prisma/client';
import { EvidenceFreshnessCalculator } from './evidence-freshness-calculator.service';
import { EvidenceConfidenceCalculator } from './evidence-confidence-calculator.service';
import { EvidenceQualityScorer } from './evidence-quality-scorer.service';
export declare class EvidenceManagementService {
    private readonly freshnessCalculator;
    private readonly confidenceCalculator;
    private readonly qualityScorer;
    private readonly logger;
    constructor(freshnessCalculator: EvidenceFreshnessCalculator, confidenceCalculator: EvidenceConfidenceCalculator, qualityScorer: EvidenceQualityScorer);
    enrichEvidenceItem(item: EvidenceItemDto, place?: Place): Promise<EvidenceItemDto>;
    enrichEvidenceItems(items: EvidenceItemDto[], places?: Map<number, Place>): Promise<EvidenceItemDto[]>;
}
