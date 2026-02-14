"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DEMResolutionCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEMResolutionCacheService = void 0;
const common_1 = require("@nestjs/common");
let DEMResolutionCacheService = DEMResolutionCacheService_1 = class DEMResolutionCacheService {
    constructor() {
        this.logger = new common_1.Logger(DEMResolutionCacheService_1.name);
        this.cache = new Map();
        this.TTL_MS = 3600000;
    }
    async getResolution(tableName, calculateFn) {
        const cacheKey = `dem:resolution:${tableName}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.TTL_MS) {
            this.logger.debug(`[DEMResolutionCache] Cache hit: ${tableName} -> ${cached.resolution}`);
            return cached.resolution;
        }
        this.logger.debug(`[DEMResolutionCache] Cache miss: ${tableName}, calculating...`);
        const resolution = await calculateFn();
        this.cache.set(cacheKey, {
            resolution,
            timestamp: Date.now(),
        });
        this.logger.log(`[DEMResolutionCache] Cached resolution: ${tableName} -> ${resolution}`);
        return resolution;
    }
    clearCache(tableName) {
        if (tableName) {
            const cacheKey = `dem:resolution:${tableName}`;
            this.cache.delete(cacheKey);
            this.logger.log(`[DEMResolutionCache] Cleared cache for: ${tableName}`);
        }
        else {
            this.cache.clear();
            this.logger.log('[DEMResolutionCache] Cleared all cache');
        }
    }
    getCacheStats() {
        const entries = [];
        for (const [key, value] of this.cache.entries()) {
            const tableName = key.replace('dem:resolution:', '');
            entries.push({
                tableName,
                resolution: value.resolution,
                ageMs: Date.now() - value.timestamp,
            });
        }
        return {
            size: this.cache.size,
            entries,
        };
    }
};
exports.DEMResolutionCacheService = DEMResolutionCacheService;
exports.DEMResolutionCacheService = DEMResolutionCacheService = DEMResolutionCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], DEMResolutionCacheService);
//# sourceMappingURL=dem-resolution-cache.service.js.map