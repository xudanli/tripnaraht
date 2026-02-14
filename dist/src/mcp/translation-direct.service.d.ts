import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export interface TranslationParams {
    text: string | string[];
    target: string;
    source?: string;
    format?: 'text' | 'html';
}
export interface TranslationResult {
    translatedText: string;
    detectedSourceLanguage?: string;
    originalText: string;
}
export declare class TranslationDirectService implements OnModuleInit, OnModuleDestroy {
    private readonly configService;
    private readonly prisma;
    private readonly logger;
    private axiosInstance;
    private apiKey;
    private isAvailable;
    private readonly baseUrl;
    constructor(configService: ConfigService, prisma: PrismaService);
    onModuleInit(): Promise<void>;
    onModuleDestroy(): Promise<void>;
    isServiceAvailable(): boolean;
    translate(params: TranslationParams): Promise<TranslationResult | TranslationResult[]>;
    detectLanguage(text: string): Promise<{
        language: string;
        confidence: number;
    }>;
    getSupportedLanguages(targetLanguage?: string): Promise<Array<{
        language: string;
        name: string;
    }>>;
    getUserTranslationSettings(userId: string): Promise<{
        defaultTargetLanguage: string;
        preferredLanguages: string[];
        autoDetect: boolean;
    } | null>;
    saveUserTranslationSettings(userId: string, settings: {
        defaultTargetLanguage?: string;
        preferredLanguages?: string[];
        autoDetect?: boolean;
    }): Promise<void>;
    smartTranslate(userId: string, text: string, targetLanguage?: string): Promise<TranslationResult>;
}
