"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var CurrencyDirectService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CurrencyDirectService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const prisma_service_1 = require("../prisma/prisma.service");
const axios_1 = __importDefault(require("axios"));
const https = __importStar(require("https"));
const https_proxy_agent_1 = require("https-proxy-agent");
let CurrencyDirectService = CurrencyDirectService_1 = class CurrencyDirectService {
    constructor(configService, prisma) {
        this.configService = configService;
        this.prisma = prisma;
        this.logger = new common_1.Logger(CurrencyDirectService_1.name);
        this.apiKey = null;
        this.isAvailable = false;
        this.baseUrl = 'https://api.exchangerate-api.com/v4';
        this.apiKey =
            this.configService.get('EXCHANGE_RATE_API_KEY') ||
                process.env.EXCHANGE_RATE_API_KEY ||
                null;
    }
    async onModuleInit() {
        const proxyUrl = process.env.HTTPS_PROXY ||
            process.env.https_proxy ||
            process.env.ALL_PROXY ||
            process.env.all_proxy;
        const httpsAgent = proxyUrl
            ? new https_proxy_agent_1.HttpsProxyAgent(proxyUrl)
            : new https.Agent({
                keepAlive: true,
                family: 4,
                rejectUnauthorized: true,
            });
        this.axiosInstance = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            httpsAgent,
            proxy: false,
            headers: {
                'User-Agent': 'TripNARA/1.0',
            },
        });
        try {
            const testResponse = await this.axiosInstance.get('/latest/USD');
            if (testResponse.data && testResponse.data.rates) {
                this.isAvailable = true;
                this.logger.log('Currency Direct Service initialized');
            }
            else {
                this.logger.warn('ExchangeRate API test returned unexpected format');
                this.isAvailable = false;
            }
        }
        catch (error) {
            this.logger.error('Failed to initialize Currency Direct Service:', error.message);
            this.isAvailable = false;
        }
    }
    async onModuleDestroy() {
        this.logger.log('Currency Direct Service destroyed');
    }
    isServiceAvailable() {
        return this.isAvailable;
    }
    async getLatestRates(params = {}) {
        if (!this.isServiceAvailable()) {
            throw new Error('Currency Exchange service is not available');
        }
        try {
            const base = params.base || 'USD';
            const url = `/latest/${base}`;
            const response = await this.axiosInstance.get(url);
            if (!response.data || !response.data.rates) {
                throw new Error('Invalid response from ExchangeRate API');
            }
            let rates = response.data.rates;
            if (params.symbols && params.symbols.length > 0) {
                const filteredRates = {};
                for (const symbol of params.symbols) {
                    if (rates[symbol] !== undefined) {
                        filteredRates[symbol] = rates[symbol];
                    }
                }
                rates = filteredRates;
            }
            return {
                base: response.data.base || base,
                date: response.data.date || new Date().toISOString().split('T')[0],
                rates,
            };
        }
        catch (error) {
            this.logger.error('Failed to get latest rates:', error.message);
            throw error;
        }
    }
    async getHistoricalRates(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Currency Exchange service is not available');
        }
        try {
            const base = params.base || 'USD';
            const date = params.date;
            if (!date) {
                throw new Error('Date is required for historical rates');
            }
            const url = `/history/${base}/${date}`;
            const response = await this.axiosInstance.get(url);
            if (!response.data || !response.data.rates) {
                throw new Error('Invalid response from ExchangeRate API');
            }
            let rates = response.data.rates;
            if (params.symbols && params.symbols.length > 0) {
                const filteredRates = {};
                for (const symbol of params.symbols) {
                    if (rates[symbol] !== undefined) {
                        filteredRates[symbol] = rates[symbol];
                    }
                }
                rates = filteredRates;
            }
            return {
                base: response.data.base || base,
                date: response.data.date || date,
                rates,
            };
        }
        catch (error) {
            this.logger.error('Failed to get historical rates:', error.message);
            throw error;
        }
    }
    async convertCurrency(params) {
        if (!this.isServiceAvailable()) {
            throw new Error('Currency Exchange service is not available');
        }
        try {
            const { amount, from, to, date } = params;
            let exchangeRateResponse;
            if (date) {
                exchangeRateResponse = await this.getHistoricalRates({
                    base: from,
                    symbols: [to],
                    date,
                });
            }
            else {
                exchangeRateResponse = await this.getLatestRates({
                    base: from,
                    symbols: [to],
                });
            }
            const rate = exchangeRateResponse.rates[to];
            if (!rate) {
                throw new Error(`Exchange rate not found for ${from} to ${to}`);
            }
            const result = amount * rate;
            return {
                amount,
                from,
                to,
                result: Math.round(result * 100) / 100,
                rate,
                date: exchangeRateResponse.date,
            };
        }
        catch (error) {
            this.logger.error('Failed to convert currency:', error.message);
            throw error;
        }
    }
    async convertMultipleCurrencies(amount, from, to) {
        if (!this.isServiceAvailable()) {
            throw new Error('Currency Exchange service is not available');
        }
        try {
            const exchangeRateResponse = await this.getLatestRates({
                base: from,
                symbols: to,
            });
            return to.map((currency) => {
                const rate = exchangeRateResponse.rates[currency];
                if (!rate) {
                    throw new Error(`Exchange rate not found for ${from} to ${currency}`);
                }
                return {
                    to: currency,
                    result: Math.round(amount * rate * 100) / 100,
                    rate,
                };
            });
        }
        catch (error) {
            this.logger.error('Failed to convert multiple currencies:', error.message);
            throw error;
        }
    }
    async getRateTrend(from, to, days = 7) {
        if (!this.isServiceAvailable()) {
            throw new Error('Currency Exchange service is not available');
        }
        try {
            const trends = [];
            const today = new Date();
            for (let i = 0; i < days; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                try {
                    const exchangeRateResponse = await this.getHistoricalRates({
                        base: from,
                        symbols: [to],
                        date: dateStr,
                    });
                    const rate = exchangeRateResponse.rates[to];
                    if (rate) {
                        trends.push({
                            date: dateStr,
                            rate,
                        });
                    }
                }
                catch (error) {
                    this.logger.warn(`Failed to get rate for ${dateStr}:`, error.message);
                }
            }
            return trends.reverse();
        }
        catch (error) {
            this.logger.error('Failed to get rate trend:', error.message);
            throw error;
        }
    }
    async getUserCurrencySettings(userId) {
        try {
            const settings = await this.prisma.currencySettings.findUnique({
                where: { userId },
            });
            if (!settings) {
                return null;
            }
            return {
                defaultCurrency: settings.defaultCurrency || 'USD',
                preferredCurrencies: settings.preferredCurrencies || [],
            };
        }
        catch (error) {
            this.logger.error('Failed to get user currency settings:', error.message);
            throw error;
        }
    }
    async saveUserCurrencySettings(userId, settings) {
        try {
            await this.prisma.currencySettings.upsert({
                where: { userId },
                create: {
                    userId,
                    defaultCurrency: settings.defaultCurrency || 'USD',
                    preferredCurrencies: settings.preferredCurrencies || [],
                },
                update: {
                    defaultCurrency: settings.defaultCurrency,
                    preferredCurrencies: settings.preferredCurrencies,
                    updatedAt: new Date(),
                },
            });
        }
        catch (error) {
            this.logger.error('Failed to save user currency settings:', error.message);
            throw error;
        }
    }
    getSupportedCurrencies() {
        return [
            'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'HKD', 'SGD',
            'NZD', 'KRW', 'INR', 'BRL', 'MXN', 'RUB', 'ZAR', 'SEK', 'NOK', 'DKK',
            'PLN', 'CZK', 'HUF', 'ILS', 'TRY', 'THB', 'MYR', 'PHP', 'IDR', 'VND',
        ];
    }
};
exports.CurrencyDirectService = CurrencyDirectService;
exports.CurrencyDirectService = CurrencyDirectService = CurrencyDirectService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        prisma_service_1.PrismaService])
], CurrencyDirectService);
//# sourceMappingURL=currency-direct.service.js.map