import { EvidenceItemDto, EvidenceFreshnessDto } from '../dto/evidence.dto';
import { Place } from '@prisma/client';
export declare class EvidenceFreshnessCalculator {
    private readonly logger;
    private readonly TTL_MAP;
    calculateFreshness(item: EvidenceItemDto, place?: Place): EvidenceFreshnessDto | undefined;
    private extractTimestamp;
    private getTTLForEvidenceType;
}
