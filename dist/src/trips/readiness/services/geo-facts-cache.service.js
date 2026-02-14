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
var GeoFactsCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeoFactsCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../../redis/redis.service");
const crypto = __importStar(require("crypto"));
let GeoFactsCacheService = GeoFactsCacheService_1 = class GeoFactsCacheService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(GeoFactsCacheService_1.name);
        this.memoryCache = new Map();
        this.L1_TTL_MS = 5 * 60 * 1000;
        this.L2_TTL_SEC = 24 * 60 * 60;
        this.CACHE_VERSION = '1.0.0';
    }
    generateKey(lat, lng, options) {
        const latRounded = lat.toFixed(4);
        const lngRounded = lng.toFixed(4);
        const relevantOptions = options ? {
            densityBufferKm: options.densityBufferKm,
            nearRiverThresholdM: options.nearRiverThresholdM,
            nearRoadThresholdM: options.nearRoadThresholdM,
            nearCoastlineThresholdKm: options.nearCoastlineThresholdKm,
            coastalAreaThresholdKm: options.coastalAreaThresholdKm,
            nearPortThresholdKm: options.nearPortThresholdKm,
            nearAirportThresholdKm: options.nearAirportThresholdKm,
            poiRadiusKm: options.poiRadiusKm,
            pickupLimit: options.pickupLimit,
        } : {};
        const optionsHash = crypto
            .createHash('md5')
            .update(JSON.stringify(relevantOptions))
            .digest('hex')
            .substring(0, 8);
        return `geo:features:${latRounded}:${lngRounded}:${optionsHash}`;
    }
    async get(lat, lng, options) {
        const key = this.generateKey(lat, lng, options);
        const l1Entry = this.memoryCache.get(key);
        if (l1Entry && Date.now() - l1Entry.timestamp < this.L1_TTL_MS) {
            this.logger.debug(`L1 cache hit for key: ${key}`);
            return l1Entry.data;
        }
        if (this.redisService) {
            try {
                const l2Data = await this.redisService.get(key);
                if (l2Data) {
                    if (l2Data.cacheVersion === this.CACHE_VERSION) {
                        this.memoryCache.set(key, {
                            ...l2Data,
                            timestamp: Date.now(),
                        });
                        this.logger.debug(`L2 cache hit for key: ${key}`);
                        return l2Data.data;
                    }
                    else {
                        await this.redisService.del(key);
                        this.logger.debug(`Cache version mismatch for key: ${key}, deleted`);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Redis cache get failed for key: ${key}`, error);
            }
        }
        return null;
    }
    async set(lat, lng, data, options) {
        const key = this.generateKey(lat, lng, options);
        const entry = {
            data,
            timestamp: Date.now(),
            ttl: this.L1_TTL_MS,
            cacheVersion: this.CACHE_VERSION,
        };
        this.memoryCache.set(key, entry);
        this.logger.debug(`L1 cache set for key: ${key}`);
        if (this.redisService) {
            try {
                await this.redisService.set(key, entry, this.L2_TTL_SEC);
                this.logger.debug(`L2 cache set for key: ${key}`);
            }
            catch (error) {
                this.logger.warn(`Redis cache set failed for key: ${key}`, error);
            }
        }
        if (this.memoryCache.size > 1000) {
            this.cleanupL1();
        }
    }
    cleanupL1() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.memoryCache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.debug(`Cleaned up ${cleaned} expired L1 cache entries`);
        }
    }
    async clear() {
        this.memoryCache.clear();
        this.logger.debug('L1 cache cleared');
        this.logger.debug('L2 cache will expire automatically after TTL');
    }
    async getStats() {
        return {
            l1Size: this.memoryCache.size,
            l1Keys: Array.from(this.memoryCache.keys()),
        };
    }
    async warmup(coordinates, fetcher) {
        this.logger.log(`Warming up cache for ${coordinates.length} coordinates`);
        const promises = coordinates.map(async ({ lat, lng, options }) => {
            try {
                const data = await fetcher(lat, lng, options);
                await this.set(lat, lng, data, options);
            }
            catch (error) {
                this.logger.warn(`Failed to warmup cache for ${lat}, ${lng}: ${error}`);
            }
        });
        await Promise.all(promises);
        this.logger.log('Cache warmup completed');
    }
    updateCacheVersion(newVersion) {
        this.logger.log(`Cache version updated to ${newVersion}, old cache will be invalidated`);
    }
};
exports.GeoFactsCacheService = GeoFactsCacheService;
exports.GeoFactsCacheService = GeoFactsCacheService = GeoFactsCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], GeoFactsCacheService);
//# sourceMappingURL=geo-facts-cache.service.js.map