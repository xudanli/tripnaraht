import { CurrencyDirectService, CurrencyConversionParams } from './currency-direct.service';
export declare class CurrencyDirectController {
    private readonly currencyService;
    constructor(currencyService: CurrencyDirectService);
    health(): Promise<{
        success: boolean;
        available: boolean;
    }>;
    getLatestRates(base?: string, symbols?: string): Promise<{
        base: string;
        date: string;
        rates: Record<string, number>;
        success: boolean;
    }>;
    getHistoricalRates(date: string, base?: string, symbols?: string): Promise<{
        base: string;
        date: string;
        rates: Record<string, number>;
        success: boolean;
    }>;
    convertCurrency(body: CurrencyConversionParams): Promise<{
        amount: number;
        from: string;
        to: string;
        result: number;
        rate: number;
        date: string;
        success: boolean;
    }>;
    convertMultipleCurrencies(body: {
        amount: number;
        from: string;
        to: string[];
    }): Promise<{
        success: boolean;
        amount: number;
        from: string;
        results: {
            to: string;
            result: number;
            rate: number;
        }[];
    }>;
    getRateTrend(from: string, to: string, days?: string): Promise<{
        success: boolean;
        from: string;
        to: string;
        trends: {
            date: string;
            rate: number;
        }[];
    }>;
    getSupportedCurrencies(): Promise<{
        success: boolean;
        currencies: string[];
        count: number;
    }>;
    getUserCurrencySettings(user: any): Promise<{
        success: boolean;
        settings: {
            defaultCurrency: string;
            preferredCurrencies: string[];
        };
    }>;
    saveUserCurrencySettings(user: any, body: {
        defaultCurrency?: string;
        preferredCurrencies?: string[];
    }): Promise<{
        success: boolean;
        message: string;
    }>;
}
