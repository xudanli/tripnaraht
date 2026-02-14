import { TranslationDirectService, TranslationParams } from './translation-direct.service';
export declare class TranslationDirectController {
    private readonly translationService;
    constructor(translationService: TranslationDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    translate(body: TranslationParams): Promise<{
        success: boolean;
        result: import("./translation-direct.service").TranslationResult | import("./translation-direct.service").TranslationResult[];
    }>;
    detectLanguage(body: {
        text: string;
    }): Promise<{
        language: string;
        confidence: number;
        success: boolean;
    }>;
    getSupportedLanguages(target?: string): Promise<{
        success: boolean;
        languages: {
            language: string;
            name: string;
        }[];
        count: number;
    }>;
    getUserTranslationSettings(user: any): Promise<{
        success: boolean;
        settings: {
            defaultTargetLanguage: string;
            preferredLanguages: string[];
            autoDetect: boolean;
        };
    }>;
    saveUserTranslationSettings(user: any, body: {
        defaultTargetLanguage?: string;
        preferredLanguages?: string[];
        autoDetect?: boolean;
    }): Promise<{
        success: boolean;
        message: string;
    }>;
    smartTranslate(user: any, body: {
        text: string;
        targetLanguage?: string;
    }): Promise<{
        translatedText: string;
        detectedSourceLanguage?: string;
        originalText: string;
        success: boolean;
    }>;
}
