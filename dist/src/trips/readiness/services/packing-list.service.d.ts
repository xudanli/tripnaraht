import { PrismaService } from '../../../prisma/prisma.service';
import { GeneratePackingListDto, GeneratePackingListResponseDto, GetPackingListResponseDto, UpdatePackingListItemDto, UpdatePackingListItemResponseDto } from '../dto/packing-list.dto';
import { ReadinessService } from './readiness.service';
import { PackingTemplateService } from './packing-template.service';
export declare class PackingListService {
    private readonly prisma;
    private readonly readinessService;
    private readonly packingTemplateService;
    private readonly logger;
    constructor(prisma: PrismaService, readinessService: ReadinessService, packingTemplateService: PackingTemplateService);
    generatePackingList(tripId: string, dto: GeneratePackingListDto): Promise<GeneratePackingListResponseDto>;
    getPackingList(tripId: string): Promise<GetPackingListResponseDto>;
    updatePackingListItem(tripId: string, itemId: string, dto: UpdatePackingListItemDto): Promise<UpdatePackingListItemResponseDto>;
    private extractItemName;
    private mapCategory;
    private calculateSummary;
}
