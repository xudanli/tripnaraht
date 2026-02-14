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
var RouteCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteCacheService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const redis_service_1 = require("../../redis/redis.service");
let RouteCacheService = RouteCacheService_1 = class RouteCacheService {
    constructor(prisma, redisService) {
        this.prisma = prisma;
        this.redisService = redisService;
        this.logger = new common_1.Logger(RouteCacheService_1.name);
        this.cacheExpiryHours = 24;
        this.cachePrefix = 'route';
        this.memoryCache = new Map();
        if (!redisService) {
            this.logger.warn('RedisService not available, using in-memory cache');
        }
    }
    isShortDistance(distanceMeters) {
        return distanceMeters < 1000;
    }
    async calculateShortDistanceWalkTime(fromLat, fromLng, toLat, toLng) {
        var _a;
        try {
            const result = await this.prisma.$queryRaw `
        SELECT 
          ST_Distance(
            ST_SetSRID(ST_MakePoint(${fromLng}, ${fromLat}), 4326)::geography,
            ST_SetSRID(ST_MakePoint(${toLng}, ${toLat}), 4326)::geography
          ) as distance_meters
      `;
            const distanceMeters = ((_a = result[0]) === null || _a === void 0 ? void 0 : _a.distance_meters) || 0;
            return Math.round(distanceMeters / 80);
        }
        catch (error) {
            this.logger.error('PostGIS 距离计算失败', error);
            return this.fallbackCalculateWalkTime(fromLat, fromLng, toLat, toLng);
        }
    }
    fallbackCalculateWalkTime(fromLat, fromLng, toLat, toLng) {
        const R = 6371000;
        const dLat = this.toRadians(toLat - fromLat);
        const dLng = this.toRadians(toLng - fromLng);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(fromLat)) *
                Math.cos(this.toRadians(toLat)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distanceMeters = R * c;
        return Math.round(distanceMeters / 80);
    }
    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    generateCacheKey(fromLat, fromLng, toLat, toLng, travelMode) {
        const roundedFromLat = Math.round(fromLat * 10000) / 10000;
        const roundedFromLng = Math.round(fromLng * 10000) / 10000;
        const roundedToLat = Math.round(toLat * 10000) / 10000;
        const roundedToLng = Math.round(toLng * 10000) / 10000;
        return `${roundedFromLat},${roundedFromLng}_${roundedToLat},${roundedToLng}_${travelMode}`;
    }
    async getCachedRoute(fromLat, fromLng, toLat, toLng, travelMode) {
        var _a;
        try {
            const cacheKey = this.generateCacheKey(fromLat, fromLng, toLat, toLng, travelMode);
            const redisKey = ((_a = this.redisService) === null || _a === void 0 ? void 0 : _a.generateKey(this.cachePrefix, cacheKey)) || `${this.cachePrefix}:${cacheKey}`;
            let cached = null;
            if (this.redisService) {
                cached = await this.redisService.get(redisKey);
            }
            else {
                const memoryCached = this.memoryCache.get(redisKey);
                if (memoryCached && memoryCached.expires > Date.now()) {
                    cached = memoryCached.value;
                }
                else if (memoryCached) {
                    this.memoryCache.delete(redisKey);
                }
            }
            if (cached) {
                this.logger.debug(`缓存命中: ${redisKey}`);
                return cached;
            }
            return null;
        }
        catch (error) {
            this.logger.error('从 Redis 获取缓存失败', error);
            return null;
        }
    }
    async saveCachedRoute(fromLat, fromLng, toLat, toLng, travelMode, routeData) {
        var _a;
        try {
            const cacheKey = this.generateCacheKey(fromLat, fromLng, toLat, toLng, travelMode);
            const redisKey = ((_a = this.redisService) === null || _a === void 0 ? void 0 : _a.generateKey(this.cachePrefix, cacheKey)) || `${this.cachePrefix}:${cacheKey}`;
            const ttl = this.cacheExpiryHours * 60 * 60;
            if (this.redisService) {
                await this.redisService.set(redisKey, routeData, ttl);
            }
            else {
                this.memoryCache.set(redisKey, {
                    value: routeData,
                    expires: Date.now() + ttl * 1000,
                });
            }
            this.logger.debug(`缓存已保存: ${redisKey}, TTL: ${ttl}秒`);
        }
        catch (error) {
            this.logger.error('保存到 Redis 缓存失败', error);
        }
    }
};
exports.RouteCacheService = RouteCacheService;
exports.RouteCacheService = RouteCacheService = RouteCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        redis_service_1.RedisService])
], RouteCacheService);
//# sourceMappingURL=route-cache.service.js.map