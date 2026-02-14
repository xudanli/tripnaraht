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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RouteDirectionCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteDirectionCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const crypto = __importStar(require("crypto"));
let RouteDirectionCacheService = RouteDirectionCacheService_1 = class RouteDirectionCacheService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(RouteDirectionCacheService_1.name);
        this.RD_SELECTION_CACHE_PREFIX = 'rd:selection';
        this.POI_POOL_CACHE_PREFIX = 'rd:poi-pool';
        this.RD_SELECTION_TTL_MIN = 3600;
        this.RD_SELECTION_TTL_MAX = 21600;
        this.POI_POOL_TTL_MIN = 21600;
        this.POI_POOL_TTL_MAX = 86400;
        this.memoryCache = new Map();
        if (!redisService) {
            this.logger.warn('RedisService not available, using in-memory cache');
        }
    }
    generateRdSelectionCacheKey(countryCode, month, userIntent) {
        var _a, _b;
        const intentParts = [
            countryCode,
            (month === null || month === void 0 ? void 0 : month.toString()) || 'any',
            (userIntent.preferences || []).sort().join(','),
            userIntent.pace || 'any',
            userIntent.riskTolerance || 'any',
            ((_a = userIntent.durationDays) === null || _a === void 0 ? void 0 : _a.toString()) || 'any',
        ];
        const intentHash = crypto
            .createHash('md5')
            .update(intentParts.join('|'))
            .digest('hex')
            .substring(0, 16);
        const key = `${this.RD_SELECTION_CACHE_PREFIX}:${countryCode}:${month || 'any'}:${intentHash}`;
        return ((_b = this.redisService) === null || _b === void 0 ? void 0 : _b.generateKey(this.RD_SELECTION_CACHE_PREFIX, countryCode, month || 'any', intentHash)) || key;
    }
    async getCachedRdSelection(countryCode, month, userIntent) {
        try {
            const cacheKey = this.generateRdSelectionCacheKey(countryCode, month, userIntent);
            if (this.redisService) {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`RD selection cache hit: ${cacheKey}`);
                    return cached;
                }
            }
            else {
                const cached = this.memoryCache.get(cacheKey);
                if (cached && cached.expires > Date.now()) {
                    this.logger.debug(`RD selection cache hit (memory): ${cacheKey}`);
                    return cached.value;
                }
                else if (cached) {
                    this.memoryCache.delete(cacheKey);
                }
            }
            return null;
        }
        catch (error) {
            this.logger.error('Failed to get cached RD selection', error);
            return null;
        }
    }
    async cacheRdSelection(countryCode, month, userIntent, recommendations) {
        try {
            const cacheKey = this.generateRdSelectionCacheKey(countryCode, month, userIntent);
            const ttl = month
                ? this.RD_SELECTION_TTL_MAX
                : this.RD_SELECTION_TTL_MIN;
            if (this.redisService) {
                await this.redisService.set(cacheKey, recommendations, ttl);
                this.logger.debug(`RD selection cached: ${cacheKey}, TTL: ${ttl}s`);
            }
            else {
                this.memoryCache.set(cacheKey, {
                    value: recommendations,
                    expires: Date.now() + ttl * 1000,
                });
                this.logger.debug(`RD selection cached (memory): ${cacheKey}, TTL: ${ttl}s`);
            }
        }
        catch (error) {
            this.logger.error('Failed to cache RD selection', error);
        }
    }
    generatePoiPoolCacheKey(routeDirectionId, bufferMeters, signaturePois) {
        var _a;
        let signaturePoisHash = 'none';
        if (signaturePois) {
            const signatureStr = JSON.stringify(signaturePois);
            signaturePoisHash = crypto
                .createHash('md5')
                .update(signatureStr)
                .digest('hex')
                .substring(0, 16);
        }
        const key = `${this.POI_POOL_CACHE_PREFIX}:${routeDirectionId}:${bufferMeters}:${signaturePoisHash}`;
        return ((_a = this.redisService) === null || _a === void 0 ? void 0 : _a.generateKey(this.POI_POOL_CACHE_PREFIX, routeDirectionId, bufferMeters, signaturePoisHash)) || key;
    }
    async getCachedPoiPool(routeDirectionId, bufferMeters, signaturePois) {
        try {
            const cacheKey = this.generatePoiPoolCacheKey(routeDirectionId, bufferMeters, signaturePois);
            if (this.redisService) {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    this.logger.debug(`POI pool cache hit: ${cacheKey}`);
                    return cached;
                }
            }
            else {
                const cached = this.memoryCache.get(cacheKey);
                if (cached && cached.expires > Date.now()) {
                    this.logger.debug(`POI pool cache hit (memory): ${cacheKey}`);
                    return cached.value;
                }
                else if (cached) {
                    this.memoryCache.delete(cacheKey);
                }
            }
            return null;
        }
        catch (error) {
            this.logger.error('Failed to get cached POI pool', error);
            return null;
        }
    }
    async cachePoiPool(routeDirectionId, bufferMeters, pois, signaturePois) {
        try {
            const cacheKey = this.generatePoiPoolCacheKey(routeDirectionId, bufferMeters, signaturePois);
            const ttl = signaturePois
                ? this.POI_POOL_TTL_MAX
                : this.POI_POOL_TTL_MIN;
            if (this.redisService) {
                await this.redisService.set(cacheKey, pois, ttl);
                this.logger.debug(`POI pool cached: ${cacheKey}, TTL: ${ttl}s, size: ${pois.length}`);
            }
            else {
                this.memoryCache.set(cacheKey, {
                    value: pois,
                    expires: Date.now() + ttl * 1000,
                });
                this.logger.debug(`POI pool cached (memory): ${cacheKey}, TTL: ${ttl}s, size: ${pois.length}`);
            }
        }
        catch (error) {
            this.logger.error('Failed to cache POI pool', error);
        }
    }
    async invalidateRdSelectionCache(countryCode, month) {
        try {
            this.logger.warn('RD selection cache invalidation requires Redis SCAN, not implemented yet');
        }
        catch (error) {
            this.logger.error('Failed to invalidate RD selection cache', error);
        }
    }
    async invalidatePoiPoolCache(routeDirectionId) {
        try {
            this.logger.warn(`POI pool cache invalidation for RD ${routeDirectionId} requires Redis SCAN, not implemented yet`);
        }
        catch (error) {
            this.logger.error('Failed to invalidate POI pool cache', error);
        }
    }
    async getCacheStats() {
        return {
            rdSelectionCacheKeys: 0,
            poiPoolCacheKeys: 0,
        };
    }
};
exports.RouteDirectionCacheService = RouteDirectionCacheService;
exports.RouteDirectionCacheService = RouteDirectionCacheService = RouteDirectionCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], RouteDirectionCacheService);
//# sourceMappingURL=route-direction-cache.service.js.map