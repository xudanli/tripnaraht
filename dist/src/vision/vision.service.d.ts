import { AssistantSuggestion, PoiCandidate } from '../assist/dto/action.dto';
import { MockOcrProvider } from '../providers/ocr/mock-ocr.provider';
import { MockPoiProvider } from '../providers/poi/mock-poi.provider';
import { StandardResponse } from '../common/dto/standard-response.dto';
export declare class VisionService {
    private readonly mockOcrProvider;
    private readonly mockPoiProvider;
    private readonly logger;
    private readonly keywordExtractor;
    constructor(mockOcrProvider: MockOcrProvider, mockPoiProvider: MockPoiProvider);
    poiRecommend(image: Buffer, opts: {
        lat: number;
        lng: number;
        locale?: string;
    }): Promise<StandardResponse<{
        ocrResult: {
            fullText: string;
            lines: string[];
        };
        candidates: PoiCandidate[];
        suggestions: AssistantSuggestion[];
    }>>;
    extractText(image: Buffer, opts?: {
        locale?: string;
    }): Promise<StandardResponse<{
        fullText: string;
        lines: string[];
    }>>;
    private deduplicateAndSortCandidates;
    private calculateConfidence;
    analyzeImage(image: Buffer | string, opts?: {
        lat?: number;
        lng?: number;
        locale?: string;
    }): Promise<StandardResponse<{
        sceneType?: 'NATURAL' | 'URBAN' | 'CULTURAL' | 'ADVENTURE' | 'RELAXATION';
        detectedObjects?: string[];
        weatherConditions?: 'SUNNY' | 'CLOUDY' | 'RAINY' | 'SNOWY';
        crowdLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
        accessibility?: 'ACCESSIBLE' | 'MODERATE' | 'CHALLENGING';
        location?: {
            lat: number;
            lng: number;
            confidence: number;
        };
        confidence: number;
    }>>;
    private inferSceneType;
    private extractObjectsFromText;
    private inferWeatherFromText;
    private inferCrowdLevelFromText;
    private inferAccessibilityFromText;
}
