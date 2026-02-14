"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DataSourceRouterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataSourceRouterService = void 0;
const common_1 = require("@nestjs/common");
let DataSourceRouterService = DataSourceRouterService_1 = class DataSourceRouterService {
    constructor() {
        this.logger = new common_1.Logger(DataSourceRouterService_1.name);
        this.roadStatusAdapters = [];
        this.weatherAdapters = [];
        this.transportAdapters = [];
        this.ferryAdapters = [];
        this.roadStatusAdapterCache = new Map();
        this.weatherAdapterCache = new Map();
        this.transportAdapterCache = new Map();
        this.ferryAdapterCache = new Map();
    }
    registerRoadStatusAdapter(adapter) {
        this.roadStatusAdapters.push(adapter);
        this.logger.log(`注册路况适配器: ${adapter.getName()}`);
    }
    registerWeatherAdapter(adapter) {
        this.weatherAdapters.push(adapter);
        this.logger.log(`注册天气适配器: ${adapter.getName()}`);
    }
    registerTransportAdapter(adapter) {
        this.transportAdapters.push(adapter);
        this.logger.log(`注册公共交通适配器: ${adapter.getName()}`);
    }
    registerFerryAdapter(adapter) {
        this.ferryAdapters.push(adapter);
        this.logger.log(`注册轮渡适配器: ${adapter.getName()}`);
    }
    async getRoadStatus(query) {
        const countryCode = await this.getCountryCode(query.lat, query.lng);
        const adapter = this.selectRoadStatusAdapter(countryCode);
        return adapter.getRoadStatus(query);
    }
    async getRoadStatuses(query) {
        const countryCode = await this.getCountryCode(query.lat, query.lng);
        const adapter = this.selectRoadStatusAdapter(countryCode);
        return adapter.getRoadStatuses(query);
    }
    async getWeather(query) {
        var _a, _b, _c;
        const countryCode = await this.getCountryCode(query.lat, query.lng);
        const candidates = this.weatherAdapters.filter(adapter => adapter.getSupportedCountries().includes(countryCode) ||
            adapter.getSupportedCountries().includes('*'));
        if (candidates.length === 0) {
            throw new Error(`未找到支持国家 ${countryCode} 的天气适配器`);
        }
        candidates.sort((a, b) => a.getPriority() - b.getPriority());
        let lastError = null;
        for (const adapter of candidates) {
            try {
                const weatherData = await adapter.getWeather(query);
                this.logger.debug(`成功使用适配器 ${adapter.getName()} 获取天气数据`);
                return weatherData;
            }
            catch (error) {
                lastError = error;
                const errorMsg = ((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || error.message;
                this.logger.warn(`适配器 ${adapter.getName()} 失败: ${errorMsg}，尝试下一个适配器`);
                continue;
            }
        }
        throw new Error(`所有天气适配器都失败。最后错误: ${(lastError === null || lastError === void 0 ? void 0 : lastError.message) || 'Unknown error'}`);
    }
    async getTransportSchedule(query) {
        let countryCode;
        if (query.from.coordinates) {
            countryCode = await this.getCountryCode(query.from.coordinates.lat, query.from.coordinates.lng);
        }
        else if (query.to.coordinates) {
            countryCode = await this.getCountryCode(query.to.coordinates.lat, query.to.coordinates.lng);
        }
        if (!countryCode) {
            throw new Error('无法确定国家代码，请提供坐标信息');
        }
        const adapter = this.selectTransportAdapter(countryCode);
        return adapter.getSchedule(query);
    }
    async getFerrySchedule(query) {
        let countryCode;
        if (query.from.coordinates) {
            countryCode = await this.getCountryCode(query.from.coordinates.lat, query.from.coordinates.lng);
        }
        else if (query.to.coordinates) {
            countryCode = await this.getCountryCode(query.to.coordinates.lat, query.to.coordinates.lng);
        }
        if (!countryCode) {
            throw new Error('无法确定国家代码，请提供坐标信息');
        }
        const adapter = this.selectFerryAdapter(countryCode);
        return adapter.getSchedule(query);
    }
    selectRoadStatusAdapter(countryCode) {
        if (this.roadStatusAdapterCache.has(countryCode)) {
            return this.roadStatusAdapterCache.get(countryCode);
        }
        const candidates = this.roadStatusAdapters.filter(adapter => adapter.getSupportedCountries().includes(countryCode) ||
            adapter.getSupportedCountries().includes('*'));
        if (candidates.length === 0) {
            const defaultAdapter = this.roadStatusAdapters.find(a => a.getSupportedCountries().includes('*'));
            if (defaultAdapter) {
                this.roadStatusAdapterCache.set(countryCode, defaultAdapter);
                return defaultAdapter;
            }
            throw new Error(`未找到支持国家 ${countryCode} 的路况适配器`);
        }
        candidates.sort((a, b) => a.getPriority() - b.getPriority());
        const selected = candidates[0];
        this.roadStatusAdapterCache.set(countryCode, selected);
        this.logger.debug(`为 ${countryCode} 选择路况适配器: ${selected.getName()}`);
        return selected;
    }
    selectWeatherAdapter(countryCode) {
        if (this.weatherAdapterCache.has(countryCode)) {
            return this.weatherAdapterCache.get(countryCode);
        }
        const candidates = this.weatherAdapters.filter(adapter => adapter.getSupportedCountries().includes(countryCode) ||
            adapter.getSupportedCountries().includes('*'));
        if (candidates.length === 0) {
            const defaultAdapter = this.weatherAdapters.find(a => a.getSupportedCountries().includes('*'));
            if (defaultAdapter) {
                this.weatherAdapterCache.set(countryCode, defaultAdapter);
                return defaultAdapter;
            }
            throw new Error(`未找到支持国家 ${countryCode} 的天气适配器`);
        }
        candidates.sort((a, b) => a.getPriority() - b.getPriority());
        const selected = candidates[0];
        this.weatherAdapterCache.set(countryCode, selected);
        this.logger.debug(`为 ${countryCode} 选择天气适配器: ${selected.getName()}`);
        return selected;
    }
    selectTransportAdapter(countryCode) {
        if (this.transportAdapterCache.has(countryCode)) {
            return this.transportAdapterCache.get(countryCode);
        }
        const candidates = this.transportAdapters.filter(adapter => adapter.getSupportedCountries().includes(countryCode) ||
            adapter.getSupportedCountries().includes('*'));
        if (candidates.length === 0) {
            const defaultAdapter = this.transportAdapters.find(a => a.getSupportedCountries().includes('*'));
            if (defaultAdapter) {
                this.transportAdapterCache.set(countryCode, defaultAdapter);
                return defaultAdapter;
            }
            throw new Error(`未找到支持国家 ${countryCode} 的公共交通适配器`);
        }
        candidates.sort((a, b) => a.getPriority() - b.getPriority());
        const selected = candidates[0];
        this.transportAdapterCache.set(countryCode, selected);
        this.logger.debug(`为 ${countryCode} 选择公共交通适配器: ${selected.getName()}`);
        return selected;
    }
    selectFerryAdapter(countryCode) {
        if (this.ferryAdapterCache.has(countryCode)) {
            return this.ferryAdapterCache.get(countryCode);
        }
        const candidates = this.ferryAdapters.filter(adapter => adapter.getSupportedCountries().includes(countryCode) ||
            adapter.getSupportedCountries().includes('*'));
        if (candidates.length === 0) {
            const defaultAdapter = this.ferryAdapters.find(a => a.getSupportedCountries().includes('*'));
            if (defaultAdapter) {
                this.ferryAdapterCache.set(countryCode, defaultAdapter);
                return defaultAdapter;
            }
            throw new Error(`未找到支持国家 ${countryCode} 的轮渡适配器`);
        }
        candidates.sort((a, b) => a.getPriority() - b.getPriority());
        const selected = candidates[0];
        this.ferryAdapterCache.set(countryCode, selected);
        this.logger.debug(`为 ${countryCode} 选择轮渡适配器: ${selected.getName()}`);
        return selected;
    }
    async getCountryCode(lat, lng) {
        if (lat >= 63.0 && lat <= 67.0 && lng >= -25.0 && lng <= -13.0) {
            return 'IS';
        }
        if (lat >= 57.0 && lat <= 71.0 && lng >= 4.0 && lng <= 32.0) {
            return 'NO';
        }
        if (lat >= -47.0 && lat <= -34.0 && lng >= 166.0 && lng <= 179.0) {
            return 'NZ';
        }
        if (lat >= 18.0 && lat <= 54.0 && lng >= 73.0 && lng <= 135.0) {
            return 'CN';
        }
        if (lat >= 45.0 && lat <= 48.0 && lng >= 5.0 && lng <= 11.0) {
            return 'CH';
        }
        if (lat >= 24.0 && lat <= 46.0 && lng >= 122.0 && lng <= 146.0) {
            return 'JP';
        }
        return 'UNKNOWN';
    }
    onModuleInit() {
        console.log('🔌 [DataSourceRouter] onModuleInit called - START');
        this.logger.log('数据源路由器服务已初始化');
        this.logger.log(`已注册 ${this.roadStatusAdapters.length} 个路况适配器`);
        this.logger.log(`已注册 ${this.weatherAdapters.length} 个天气适配器`);
        this.logger.log(`已注册 ${this.transportAdapters.length} 个公共交通适配器`);
        this.logger.log(`已注册 ${this.ferryAdapters.length} 个轮渡适配器`);
        console.log('🔌 [DataSourceRouter] onModuleInit called - END');
    }
};
exports.DataSourceRouterService = DataSourceRouterService;
exports.DataSourceRouterService = DataSourceRouterService = DataSourceRouterService_1 = __decorate([
    (0, common_1.Injectable)()
], DataSourceRouterService);
//# sourceMappingURL=data-source-router.service.js.map