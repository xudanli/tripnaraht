import { OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
export interface ExchangeRateParams {
    base?: string;
    symbols?: string[];
    date?: string;
}
export interface CurrencyConversionParams {
    amount: number;
    from: string;
    to: string;
    date?: string;
}
export interface ExchangeRateResponse {
    base: string;
    date: string;
    rates: Record<string, number>;
}
export declare class CurrencyDirectService implements OnModuleInit, OnModuleDestroy {
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
    getLatestRates(params?: ExchangeRateParams): Promise<ExchangeRateResponse>;
    getHistoricalRates(params: ExchangeRateParams & {
        date: string;
    }): Promise<ExchangeRateResponse>;
    convertCurrency(params: CurrencyConversionParams): Promise<{
        amount: number;
        from: string;
        to: string;
        result: number;
        rate: number;
        date: string;
    }>;
    convertMultipleCurrencies(amount: number, from: string, to: string[]): Promise<Array<{
        to: string;
        result: number;
        rate: number;
    }>>;
    getRateTrend(from: string, to: string, days?: number): Promise<Array<{
        date: string;
        rate: number;
    }>>;
    getUserCurrencySettings(userId: string): Promise<{
        defaultCurrency: string;
        preferredCurrencies: string[];
    } | null>;
    saveUserCurrencySettings(userId: string, settings: {
        defaultCurrency?: string;
        preferredCurrencies?: string[];
    }): Promise<void>;
    getSupportedCurrencies(): string[];
}
