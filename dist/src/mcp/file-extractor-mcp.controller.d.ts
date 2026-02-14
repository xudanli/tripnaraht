import { FileExtractorMcpService } from './file-extractor-mcp.service';
import { ExtractMetadataDto, ExtractFileContentDto } from './dto/file-extractor.dto';
export declare class FileExtractorMcpController {
    private readonly fileExtractorMcpService;
    private readonly logger;
    constructor(fileExtractorMcpService: FileExtractorMcpService);
    health(): import("../common/dto/standard-response.dto").StandardResponse<{
        available: boolean;
        service: string;
    }>;
    listTools(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    extractMetadata(dto: ExtractMetadataDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    extractFileContent(dto: ExtractFileContentDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
