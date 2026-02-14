import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
export interface VllmModelInfo {
    id: string;
    object: string;
    created: number;
    owned_by: string;
}
export interface LoraAdapter {
    name: string;
    path: string;
    base_model: string;
    rank: number;
    loaded: boolean;
}
export interface GenerateRequest {
    model: string;
    messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    top_p?: number;
    stream?: boolean;
    lora_adapter?: string;
}
export interface GenerateResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}
export declare class VllmClientService implements OnModuleInit {
    private readonly configService;
    private readonly httpService;
    private readonly logger;
    private vllmUrl;
    private apiKey?;
    private isAvailable;
    private loadedAdapters;
    constructor(configService: ConfigService, httpService: HttpService);
    onModuleInit(): Promise<void>;
    private getHeaders;
    checkHealth(): Promise<boolean>;
    isServiceAvailable(): boolean;
    refreshModelInfo(): Promise<void>;
    listModels(): Promise<VllmModelInfo[]>;
    generate(request: GenerateRequest): Promise<GenerateResponse>;
    loadLoraAdapter(name: string, path: string): Promise<boolean>;
    unloadLoraAdapter(name: string): Promise<boolean>;
    getLoadedAdapters(): LoraAdapter[];
    generateDecision(options: {
        systemPrompt?: string;
        userRequest: string;
        loraAdapter?: string;
        temperature?: number;
        maxTokens?: number;
    }): Promise<{
        content: string;
        usage: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
        };
        latency_ms: number;
    }>;
    batchGenerate(requests: Array<{
        id: string;
        messages: GenerateRequest['messages'];
    }>, options?: {
        loraAdapter?: string;
        concurrency?: number;
    }): Promise<Array<{
        id: string;
        content: string;
        latency_ms: number;
        error?: string;
    }>>;
}
