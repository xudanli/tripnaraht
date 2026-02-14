import { EvidenceItemDto, EvidencePriorityFilter, EvidenceGroupBy, EvidenceSortBy } from '../dto/evidence.dto';
export declare class EvidenceFilteringService {
    private readonly logger;
    filterAndSort(items: EvidenceItemDto[], priority?: EvidencePriorityFilter, groupBy?: EvidenceGroupBy, sortBy?: EvidenceSortBy, currentDay?: number): EvidenceItemDto[];
    private filterByPriority;
    private calculateImportance;
    private sortItems;
    private getFreshnessScore;
    groupItems(items: EvidenceItemDto[], groupBy: EvidenceGroupBy): Record<string, EvidenceItemDto[]>;
}
