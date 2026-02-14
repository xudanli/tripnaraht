import { PrismaService } from '../../prisma/prisma.service';
import { RouteGenerationPOIData, CompletePOIData, POILayerMetadata } from '../interfaces/poi-layer.interface';
export declare class POILayerService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getPOIsForRouteGeneration(poiIds: string[]): Promise<RouteGenerationPOIData[]>;
    getPOIForRouteGeneration(poiId: string): Promise<RouteGenerationPOIData | null>;
    getCompletePOI(poiId: string): Promise<CompletePOIData | null>;
    private getStaticLayerData;
    private getSemiDynamicLayerData;
    private getHighlyDynamicLayerData;
    private extractTags;
    getPOILayerMetadata(poiId: string): Promise<POILayerMetadata[]>;
    private calculateQualityScore;
    private calculateSemiDynamicQualityScore;
    isUsableForRouteGeneration(poiId: string): Promise<boolean>;
    filterUsablePOIs(poiIds: string[]): Promise<string[]>;
}
