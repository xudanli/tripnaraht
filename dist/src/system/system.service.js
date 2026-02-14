"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SystemService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let SystemService = class SystemService {
    constructor(configService) {
        this.configService = configService;
    }
    getStatus() {
        return {
            ocrProvider: this.getOcrProvider(),
            poiProvider: this.getPoiProvider(),
            asrProvider: this.getAsrProvider(),
            ttsProvider: this.getTtsProvider(),
            llmProvider: this.getLlmProvider(),
            rateLimit: {
                enabled: false,
                remaining: null,
                resetAt: null,
            },
            features: {
                vision: {
                    enabled: true,
                    maxFileSize: 6 * 1024 * 1024,
                    supportedFormats: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
                },
                voice: {
                    enabled: true,
                    asrEnabled: true,
                    ttsEnabled: true,
                },
                whatIf: {
                    enabled: true,
                    maxSamples: 1000,
                },
            },
        };
    }
    getOcrProvider() {
        var _a;
        const apiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_VISION_API_KEY');
        return apiKey ? 'google' : 'mock';
    }
    getPoiProvider() {
        var _a;
        const googleKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('GOOGLE_PLACES_API_KEY');
        if (googleKey)
            return 'google';
        return 'mock';
    }
    getAsrProvider() {
        var _a, _b;
        const openaiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENAI_API_KEY');
        if (openaiKey)
            return 'openai';
        const googleKey = (_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_SPEECH_API_KEY');
        if (googleKey)
            return 'google';
        return 'mock';
    }
    getTtsProvider() {
        var _a, _b;
        const openaiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENAI_API_KEY');
        if (openaiKey)
            return 'openai';
        const googleKey = (_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('GOOGLE_TTS_API_KEY');
        if (googleKey)
            return 'google';
        return 'mock';
    }
    getLlmProvider() {
        var _a, _b, _c;
        const openaiKey = (_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('OPENAI_API_KEY');
        if (openaiKey)
            return 'openai';
        const anthropicKey = (_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('ANTHROPIC_API_KEY');
        if (anthropicKey)
            return 'anthropic';
        const googleKey = (_c = this.configService) === null || _c === void 0 ? void 0 : _c.get('GOOGLE_AI_API_KEY');
        if (googleKey)
            return 'google';
        return 'mock';
    }
    async getAdminMetrics() {
        return {
            system: {
                cpuUsage: 0,
                memoryUsage: 0,
                diskUsage: 0,
                uptime: process.uptime(),
            },
            api: {
                totalRequests: 0,
                requestsPerSecond: 0,
                avgResponseTime: 0,
                p95ResponseTime: 0,
                p99ResponseTime: 0,
                errorRate: 0,
                successRate: 1,
            },
            database: {
                connectionPoolSize: 0,
                activeConnections: 0,
                idleConnections: 0,
                queryCount: 0,
                avgQueryTime: 0,
                slowQueries: 0,
            },
            cache: {
                hitRate: 0,
                missRate: 0,
                totalKeys: 0,
                memoryUsage: 0,
            },
            timestamp: new Date().toISOString(),
        };
    }
    async getAdminPerformance(options) {
        return {
            timeSeries: [],
            summary: {
                peakRequestsPerSecond: 0,
                peakResponseTime: 0,
                peakErrorRate: 0,
            },
        };
    }
    async getAdminErrors(options) {
        return {
            summary: {
                totalErrors: 0,
                errorRate: 0,
                uniqueErrors: 0,
            },
            byType: {},
            topErrors: [],
            trends: {
                errorsByHour: [],
            },
        };
    }
    async getAdminRequests(options) {
        return {
            summary: {
                totalRequests: 0,
                requestsPerSecond: 0,
                uniqueUsers: 0,
                uniqueIPs: 0,
            },
            byEndpoint: [],
            byMethod: {
                GET: 0,
                POST: 0,
                PUT: 0,
                DELETE: 0,
                PATCH: 0,
            },
            byStatus: {
                '2xx': 0,
                '3xx': 0,
                '4xx': 0,
                '5xx': 0,
            },
            timeSeries: [],
        };
    }
    async getAdminDatabase() {
        return {
            connectionPool: {
                size: 0,
                active: 0,
                idle: 0,
                waiting: 0,
            },
            queries: {
                total: 0,
                avgTime: 0,
                slowQueries: 0,
                slowQueryThreshold: 1000,
            },
            tables: {
                total: 0,
                largest: [],
            },
            health: {
                status: 'healthy',
                lastCheck: new Date().toISOString(),
            },
        };
    }
    async getAdminCache() {
        return {
            status: 'connected',
            hitRate: 0,
            missRate: 0,
            totalKeys: 0,
            memoryUsage: {
                used: 0,
                max: 0,
                percentage: 0,
            },
            operations: {
                hits: 0,
                misses: 0,
                sets: 0,
                deletes: 0,
            },
            topKeys: [],
            evictions: 0,
        };
    }
};
exports.SystemService = SystemService;
exports.SystemService = SystemService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SystemService);
//# sourceMappingURL=system.service.js.map