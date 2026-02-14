import { FileExtractorDirectService } from './file-extractor-direct.service';
import { ExtractMetadataDto, ExtractFileContentDto } from './dto/file-extractor.dto';
export declare class FileExtractorDirectController {
    private readonly fileExtractorDirectService;
    private readonly logger;
    constructor(fileExtractorDirectService: FileExtractorDirectService);
    health(): import("../common/dto/standard-response.dto").StandardResponse<{
        available: boolean;
        service: string;
        features: string[];
        authentication: string;
    }>;
    extractMetadata(dto: ExtractMetadataDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    extractFileContent(dto: ExtractFileContentDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
