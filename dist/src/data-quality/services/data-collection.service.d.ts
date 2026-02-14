import { PrismaService } from '../../prisma/prisma.service';
import { GeographicDataValidatorService, ValidationResult } from './geographic-data-validator.service';
import { DataQualityFrameworkService } from './data-quality-framework.service';
export interface CollectionConfig {
    countryCode?: string;
    source: string;
    [key: string]: any;
}
export interface RawData {
    data: any;
    metadata: {
        source: string;
        collectedAt: Date;
        countryCode?: string;
        [key: string]: any;
    };
}
export declare class DataCollectionService {
    private readonly prisma;
    private readonly geographicDataValidator;
    private readonly dataQualityFramework;
    private readonly logger;
    constructor(prisma: PrismaService, geographicDataValidator: GeographicDataValidatorService, dataQualityFramework: DataQualityFrameworkService);
    collectData(dataSource: string, dataType: string, config: CollectionConfig): Promise<RawData>;
    validateData(rawData: RawData, dataType: string): Promise<ValidationResult>;
    indexData(rawData: RawData, dataSource: string, dataType: string): Promise<number>;
    private getAdapter;
    private chunkData;
    private getRequiredFields;
}
