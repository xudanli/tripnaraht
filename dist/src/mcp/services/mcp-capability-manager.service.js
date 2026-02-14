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
var McpCapabilityManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpCapabilityManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const mcp_capability_dto_1 = require("../dto/mcp-capability.dto");
let McpCapabilityManagerService = McpCapabilityManagerService_1 = class McpCapabilityManagerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(McpCapabilityManagerService_1.name);
        this.capabilityDefinitions = new Map([
            ['google_maps', {
                    serviceName: 'google_maps',
                    displayName: 'Google Maps',
                    description: 'Google Maps API 服务，提供地点搜索、路线规划、地理编码等功能',
                    tools: ['google_maps.searchPlaces', 'google_maps.geocode', 'google_maps.getRoute', 'google_maps.computeDistanceMatrix'],
                    category: 'mapping',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['weather', {
                    serviceName: 'weather',
                    displayName: 'Weather',
                    description: '天气服务，提供当前天气和天气预报',
                    tools: ['weather.getCurrentWeather', 'weather.getWeatherByDatetimeRange', 'weather.getCurrentDateTime'],
                    category: 'weather',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['postgresql', {
                    serviceName: 'postgresql',
                    displayName: 'PostgreSQL',
                    description: 'PostgreSQL 数据库查询服务',
                    tools: ['postgresql.query', 'postgresql.execute'],
                    category: 'database',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['airbnb', {
                    serviceName: 'airbnb',
                    displayName: 'Airbnb',
                    description: 'Airbnb 房源搜索服务',
                    tools: ['airbnb.search', 'airbnb.listingDetails'],
                    category: 'accommodation',
                    authRequired: true,
                    defaultEnabled: true,
                }],
            ['rail', {
                    serviceName: 'rail',
                    displayName: 'Rail',
                    description: '铁路查询服务',
                    tools: ['rail.searchRoutes', 'rail.getRouteDetails'],
                    category: 'transportation',
                    authRequired: true,
                    defaultEnabled: true,
                }],
            ['file_extractor', {
                    serviceName: 'file_extractor',
                    displayName: 'File Extractor',
                    description: '文件内容提取服务',
                    tools: ['file_extractor.extract_file_content'],
                    category: 'utility',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['stripe', {
                    serviceName: 'stripe',
                    displayName: 'Stripe',
                    description: 'Stripe 支付服务',
                    tools: ['stripe.createPaymentIntent', 'stripe.confirmPaymentIntent', 'stripe.getPaymentIntent', 'stripe.refundPayment'],
                    category: 'payment',
                    authRequired: true,
                    defaultEnabled: true,
                }],
            ['browserbase', {
                    serviceName: 'browserbase',
                    displayName: 'Browserbase',
                    description: 'Browserbase 浏览器自动化服务',
                    tools: ['browserbase.createSession', 'browserbase.navigate', 'browserbase.screenshot', 'browserbase.click', 'browserbase.evaluate'],
                    category: 'automation',
                    authRequired: true,
                    defaultEnabled: true,
                }],
            ['currency', {
                    serviceName: 'currency',
                    displayName: 'Currency Exchange',
                    description: '货币汇率转换服务',
                    tools: ['currency.getLatestRates', 'currency.convert', 'currency.getRateTrend'],
                    category: 'finance',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['hotel', {
                    serviceName: 'hotel',
                    displayName: 'Hotel',
                    description: '酒店搜索服务',
                    tools: ['hotel.search', 'hotel.getDetails'],
                    category: 'accommodation',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['restaurant', {
                    serviceName: 'restaurant',
                    displayName: 'Restaurant',
                    description: '餐厅搜索服务',
                    tools: ['restaurant.search', 'restaurant.nearby'],
                    category: 'dining',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['translation', {
                    serviceName: 'translation',
                    displayName: 'Translation',
                    description: '翻译服务',
                    tools: ['translation.translate', 'translation.detectLanguage'],
                    category: 'utility',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['image', {
                    serviceName: 'image',
                    displayName: 'Image Search',
                    description: '图片搜索服务',
                    tools: ['image.search', 'image.recommend'],
                    category: 'media',
                    authRequired: false,
                    defaultEnabled: true,
                }],
            ['vision', {
                    serviceName: 'vision',
                    displayName: 'Vision Service',
                    description: '视觉识别服务，提供 OCR 和 POI 识别',
                    tools: ['vision.poiRecommend', 'ocr.extractText'],
                    category: 'vision',
                    authRequired: false,
                    defaultEnabled: true,
                }],
        ]);
        this.capabilityStatusCache = new Map();
    }
    async onModuleInit() {
        await this.loadCapabilitiesFromDatabase();
        this.logger.log(`Initialized ${this.capabilityStatusCache.size} MCP capabilities from database`);
    }
    async loadCapabilitiesFromDatabase() {
        var _a, _b, _c;
        try {
            for (const [serviceName, def] of this.capabilityDefinitions) {
                const existing = await this.prisma.mcpCapability.findUnique({
                    where: { serviceName },
                });
                if (!existing) {
                    await this.prisma.mcpCapability.create({
                        data: {
                            serviceName,
                            displayName: def.displayName,
                            description: def.description,
                            enabled: (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true,
                            tools: def.tools,
                            category: def.category,
                            authRequired: (_b = def.authRequired) !== null && _b !== void 0 ? _b : false,
                            defaultEnabled: (_c = def.defaultEnabled) !== null && _c !== void 0 ? _c : true,
                        },
                    });
                    this.logger.log(`Created default capability record: ${serviceName}`);
                }
                const capability = await this.prisma.mcpCapability.findUnique({
                    where: { serviceName },
                });
                if (capability) {
                    this.capabilityStatusCache.set(serviceName, capability.enabled);
                }
            }
        }
        catch (error) {
            this.logger.error(`Failed to load capabilities from database: ${error.message}`, error.stack);
            this.capabilityDefinitions.forEach((def, serviceName) => {
                var _a;
                this.capabilityStatusCache.set(serviceName, (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true);
            });
        }
    }
    async getAllCapabilities(filters) {
        try {
            const where = {};
            if (filters === null || filters === void 0 ? void 0 : filters.serviceName) {
                where.serviceName = filters.serviceName;
            }
            if (filters === null || filters === void 0 ? void 0 : filters.category) {
                where.category = filters.category;
            }
            if (filters === null || filters === void 0 ? void 0 : filters.status) {
                where.enabled = filters.status === mcp_capability_dto_1.McpCapabilityStatus.ENABLED;
            }
            const dbCapabilities = await this.prisma.mcpCapability.findMany({
                where,
                orderBy: { serviceName: 'asc' },
            });
            return dbCapabilities.map(cap => ({
                serviceName: cap.serviceName,
                displayName: cap.displayName,
                description: cap.description || '',
                enabled: cap.enabled,
                tools: Array.isArray(cap.tools) ? cap.tools : [],
                category: cap.category || undefined,
                authRequired: cap.authRequired,
            }));
        }
        catch (error) {
            this.logger.error(`Failed to get capabilities: ${error.message}`, error.stack);
            return this.getAllCapabilitiesFromCache(filters);
        }
    }
    getAllCapabilitiesFromCache(filters) {
        const capabilities = [];
        this.capabilityDefinitions.forEach((def, serviceName) => {
            var _a, _b;
            if ((filters === null || filters === void 0 ? void 0 : filters.serviceName) && serviceName !== filters.serviceName) {
                return;
            }
            if ((filters === null || filters === void 0 ? void 0 : filters.category) && def.category !== filters.category) {
                return;
            }
            const enabled = (_b = (_a = this.capabilityStatusCache.get(serviceName)) !== null && _a !== void 0 ? _a : def.defaultEnabled) !== null && _b !== void 0 ? _b : true;
            if (filters === null || filters === void 0 ? void 0 : filters.status) {
                const matchesStatus = filters.status === mcp_capability_dto_1.McpCapabilityStatus.ENABLED ? enabled : !enabled;
                if (!matchesStatus) {
                    return;
                }
            }
            capabilities.push({
                serviceName,
                displayName: def.displayName,
                description: def.description || '',
                enabled,
                tools: def.tools,
                category: def.category,
                authRequired: def.authRequired,
            });
        });
        return capabilities;
    }
    async getCapability(serviceName) {
        var _a, _b, _c;
        try {
            const capability = await this.prisma.mcpCapability.findUnique({
                where: { serviceName },
            });
            if (!capability) {
                const def = this.capabilityDefinitions.get(serviceName);
                if (!def) {
                    return null;
                }
                return {
                    serviceName,
                    displayName: def.displayName,
                    description: def.description || '',
                    enabled: (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true,
                    tools: def.tools,
                    category: def.category,
                    authRequired: def.authRequired,
                };
            }
            return {
                serviceName: capability.serviceName,
                displayName: capability.displayName,
                description: capability.description || '',
                enabled: capability.enabled,
                tools: Array.isArray(capability.tools) ? capability.tools : [],
                category: capability.category || undefined,
                authRequired: capability.authRequired,
            };
        }
        catch (error) {
            this.logger.error(`Failed to get capability: ${error.message}`, error.stack);
            const def = this.capabilityDefinitions.get(serviceName);
            if (!def) {
                return null;
            }
            const enabled = (_c = (_b = this.capabilityStatusCache.get(serviceName)) !== null && _b !== void 0 ? _b : def.defaultEnabled) !== null && _c !== void 0 ? _c : true;
            return {
                serviceName,
                displayName: def.displayName,
                description: def.description || '',
                enabled,
                tools: def.tools,
                category: def.category,
                authRequired: def.authRequired,
            };
        }
    }
    isCapabilityEnabled(serviceName) {
        var _a, _b, _c;
        if (this.capabilityStatusCache.has(serviceName)) {
            return (_a = this.capabilityStatusCache.get(serviceName)) !== null && _a !== void 0 ? _a : true;
        }
        return (_c = (_b = this.capabilityDefinitions.get(serviceName)) === null || _b === void 0 ? void 0 : _b.defaultEnabled) !== null && _c !== void 0 ? _c : true;
    }
    async isCapabilityEnabledAsync(serviceName) {
        var _a;
        try {
            const capability = await this.prisma.mcpCapability.findUnique({
                where: { serviceName },
                select: { enabled: true },
            });
            if (capability) {
                this.capabilityStatusCache.set(serviceName, capability.enabled);
                return capability.enabled;
            }
            const def = this.capabilityDefinitions.get(serviceName);
            const defaultEnabled = (_a = def === null || def === void 0 ? void 0 : def.defaultEnabled) !== null && _a !== void 0 ? _a : true;
            this.capabilityStatusCache.set(serviceName, defaultEnabled);
            return defaultEnabled;
        }
        catch (error) {
            this.logger.error(`Failed to check capability status: ${error.message}`, error.stack);
            return this.isCapabilityEnabled(serviceName);
        }
    }
    async enableCapability(serviceName) {
        if (!this.capabilityDefinitions.has(serviceName)) {
            this.logger.warn(`Unknown capability: ${serviceName}`);
            return false;
        }
        try {
            await this.prisma.mcpCapability.update({
                where: { serviceName },
                data: { enabled: true },
            });
            this.capabilityStatusCache.set(serviceName, true);
            this.logger.log(`Enabled capability: ${serviceName}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to enable capability: ${error.message}`, error.stack);
            this.capabilityStatusCache.set(serviceName, true);
            return true;
        }
    }
    async disableCapability(serviceName) {
        if (!this.capabilityDefinitions.has(serviceName)) {
            this.logger.warn(`Unknown capability: ${serviceName}`);
            return false;
        }
        try {
            await this.prisma.mcpCapability.update({
                where: { serviceName },
                data: { enabled: false },
            });
            this.capabilityStatusCache.set(serviceName, false);
            this.logger.log(`Disabled capability: ${serviceName}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to disable capability: ${error.message}`, error.stack);
            this.capabilityStatusCache.set(serviceName, false);
            return true;
        }
    }
    async updateCapabilityStatus(serviceName, enabled) {
        if (enabled) {
            return await this.enableCapability(serviceName);
        }
        else {
            return await this.disableCapability(serviceName);
        }
    }
    async batchUpdateCapabilityStatus(updates) {
        let success = 0;
        let failed = 0;
        const results = [];
        const promises = updates.map(async ({ serviceName, enabled }) => {
            try {
                const result = await this.updateCapabilityStatus(serviceName, enabled);
                if (result) {
                    success++;
                    return { serviceName, success: true };
                }
                else {
                    failed++;
                    return { serviceName, success: false, error: 'Unknown capability' };
                }
            }
            catch (error) {
                failed++;
                return { serviceName, success: false, error: error.message };
            }
        });
        const settledResults = await Promise.allSettled(promises);
        settledResults.forEach((result) => {
            var _a;
            if (result.status === 'fulfilled') {
                results.push(result.value);
            }
            else {
                failed++;
                results.push({ serviceName: 'unknown', success: false, error: ((_a = result.reason) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error' });
            }
        });
        return { success, failed, results };
    }
    async getStatistics() {
        try {
            const capabilities = await this.prisma.mcpCapability.findMany({
                select: {
                    enabled: true,
                    category: true,
                },
            });
            const stats = {
                total: capabilities.length,
                enabled: 0,
                disabled: 0,
                byCategory: {},
            };
            capabilities.forEach((cap) => {
                if (cap.enabled) {
                    stats.enabled++;
                }
                else {
                    stats.disabled++;
                }
                const category = cap.category || 'other';
                if (!stats.byCategory[category]) {
                    stats.byCategory[category] = { total: 0, enabled: 0, disabled: 0 };
                }
                stats.byCategory[category].total++;
                if (cap.enabled) {
                    stats.byCategory[category].enabled++;
                }
                else {
                    stats.byCategory[category].disabled++;
                }
            });
            return stats;
        }
        catch (error) {
            this.logger.error(`Failed to get statistics: ${error.message}`, error.stack);
            return this.getStatisticsFromCache();
        }
    }
    getStatisticsFromCache() {
        const stats = {
            total: this.capabilityDefinitions.size,
            enabled: 0,
            disabled: 0,
            byCategory: {},
        };
        this.capabilityDefinitions.forEach((def, serviceName) => {
            var _a, _b;
            const enabled = (_b = (_a = this.capabilityStatusCache.get(serviceName)) !== null && _a !== void 0 ? _a : def.defaultEnabled) !== null && _b !== void 0 ? _b : true;
            if (enabled) {
                stats.enabled++;
            }
            else {
                stats.disabled++;
            }
            const category = def.category || 'other';
            if (!stats.byCategory[category]) {
                stats.byCategory[category] = { total: 0, enabled: 0, disabled: 0 };
            }
            stats.byCategory[category].total++;
            if (enabled) {
                stats.byCategory[category].enabled++;
            }
            else {
                stats.byCategory[category].disabled++;
            }
        });
        return stats;
    }
    async resetToDefaults() {
        try {
            const updates = Array.from(this.capabilityDefinitions.entries()).map(([serviceName, def]) => {
                var _a;
                return ({
                    where: { serviceName },
                    data: { enabled: (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true },
                });
            });
            await Promise.all(updates.map(update => this.prisma.mcpCapability.update(update).catch(() => {
                var _a, _b, _c;
                const def = this.capabilityDefinitions.get(update.where.serviceName);
                if (def) {
                    return this.prisma.mcpCapability.create({
                        data: {
                            serviceName: update.where.serviceName,
                            displayName: def.displayName,
                            description: def.description,
                            enabled: (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true,
                            tools: def.tools,
                            category: def.category,
                            authRequired: (_b = def.authRequired) !== null && _b !== void 0 ? _b : false,
                            defaultEnabled: (_c = def.defaultEnabled) !== null && _c !== void 0 ? _c : true,
                        },
                    });
                }
            })));
            this.capabilityDefinitions.forEach((def, serviceName) => {
                var _a;
                this.capabilityStatusCache.set(serviceName, (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true);
            });
            this.logger.log('Reset all capabilities to default state');
        }
        catch (error) {
            this.logger.error(`Failed to reset capabilities: ${error.message}`, error.stack);
            this.capabilityDefinitions.forEach((def, serviceName) => {
                var _a;
                this.capabilityStatusCache.set(serviceName, (_a = def.defaultEnabled) !== null && _a !== void 0 ? _a : true);
            });
        }
    }
};
exports.McpCapabilityManagerService = McpCapabilityManagerService;
exports.McpCapabilityManagerService = McpCapabilityManagerService = McpCapabilityManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], McpCapabilityManagerService);
//# sourceMappingURL=mcp-capability-manager.service.js.map