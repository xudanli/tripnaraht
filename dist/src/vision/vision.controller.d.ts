import { VisionService } from './vision.service';
import { AssistantSuggestion } from '../assist/dto/action.dto';
import { StandardResponse } from '../common/dto/standard-response.dto';
interface MulterFile {
    buffer: Buffer;
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
}
export declare class VisionController {
    private readonly visionService;
    constructor(visionService: VisionService);
    poiRecommend(file: MulterFile | undefined, body: {
        lat: string;
        lng: string;
        locale?: string;
    }): Promise<StandardResponse<{
        ocrResult: {
            fullText: string;
            lines: string[];
        };
        candidates: Array<any>;
        suggestions: AssistantSuggestion[];
    }>>;
    getCapabilities(): Promise<StandardResponse<{
        supportedFormats: string[];
        maxFileSize: number;
        maxFileSizeMB: number;
        supportsHeic: boolean;
        requiresCompression: boolean;
        compressionRecommendation?: string;
        supportsExifRotation: boolean;
    }>>;
}
export {};
