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
var HybridCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HybridCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_cache_service_1 = require("./redis-cache.service");
const rag_metrics_service_1 = require("./rag-metrics.service");
let HybridCacheService = HybridCacheService_1 = class HybridCacheService {
    constructor(redisCache, metrics) {
        this.redisCache = redisCache;
        this.metrics = metrics;
        this.logger = new common_1.Logger(HybridCacheService_1.name);
        this.memoryCache = new Map();
        if (this.redisCache) {
            this.logger.log('[HybridCache] Redis 缓存已启用');
        }
        else {
            this.logger.warn('[HybridCache] Redis 不可用，使用内存缓存');
        }
    }
    async get(key) {
        var _a, _b, _c, _d, _e, _f;
        const startTime = Date.now();
        if ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) {
            try {
                const value = await this.redisCache.get(key);
                if (value !== null) {
                    this.logger.debug(`[HybridCache] Redis hit: ${key}`);
                    (_b = this.metrics) === null || _b === void 0 ? void 0 : _b.recordCacheHit('redis');
                    (_c = this.metrics) === null || _c === void 0 ? void 0 : _c.recordCacheOperation('redis', 'get', Date.now() - startTime);
                    return value;
                }
            }
            catch (error) {
                this.logger.warn(`[HybridCache] Redis 获取失败，降级到内存: ${error.message}`);
            }
        }
        const result = this.getFromMemory(key);
        const duration = Date.now() - startTime;
        if (result !== null) {
            (_d = this.metrics) === null || _d === void 0 ? void 0 : _d.recordCacheHit('memory');
        }
        else {
            (_e = this.metrics) === null || _e === void 0 ? void 0 : _e.recordCacheMiss('hybrid');
        }
        (_f = this.metrics) === null || _f === void 0 ? void 0 : _f.recordCacheOperation('memory', 'get', duration);
        return result;
    }
    async set(key, value, ttlSeconds = 3600) {
        var _a, _b, _c, _d;
        const startTime = Date.now();
        let redisSuccess = false;
        if ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) {
            try {
                redisSuccess = await this.redisCache.set(key, value, ttlSeconds);
                if (redisSuccess) {
                    this.logger.debug(`[HybridCache] Redis set: ${key} (TTL: ${ttlSeconds}s)`);
                    (_b = this.metrics) === null || _b === void 0 ? void 0 : _b.recordCacheOperation('redis', 'set', Date.now() - startTime);
                }
            }
            catch (error) {
                this.logger.warn(`[HybridCache] Redis 设置失败，降级到内存: ${error.message}`);
            }
        }
        this.setToMemory(key, value, ttlSeconds);
        (_c = this.metrics) === null || _c === void 0 ? void 0 : _c.recordCacheOperation('memory', 'set', Date.now() - startTime);
        (_d = this.metrics) === null || _d === void 0 ? void 0 : _d.updateCacheSize('memory', this.memoryCache.size);
        return redisSuccess || true;
    }
    async del(key) {
        var _a;
        let redisSuccess = false;
        if ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) {
            try {
                redisSuccess = await this.redisCache.del(key);
            }
            catch (error) {
                this.logger.warn(`[HybridCache] Redis 删除失败: ${error.message}`);
            }
        }
        const memorySuccess = this.memoryCache.delete(key);
        return redisSuccess || memorySuccess;
    }
    async delPattern(pattern) {
        var _a;
        let count = 0;
        if ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) {
            try {
                count = await this.redisCache.delPattern(pattern);
            }
            catch (error) {
                this.logger.warn(`[HybridCache] Redis 批量删除失败: ${error.message}`);
            }
        }
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const key of this.memoryCache.keys()) {
            if (regex.test(key)) {
                this.memoryCache.delete(key);
                count++;
            }
        }
        return count;
    }
    async exists(key) {
        var _a;
        if ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) {
            try {
                const exists = await this.redisCache.exists(key);
                if (exists) {
                    return true;
                }
            }
            catch (error) {
                this.logger.warn(`[HybridCache] Redis exists 失败: ${error.message}`);
            }
        }
        const cached = this.memoryCache.get(key);
        if (cached && Date.now() < cached.expiry) {
            return true;
        }
        return false;
    }
    async flushAll() {
        var _a;
        let redisSuccess = false;
        if ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) {
            try {
                redisSuccess = await this.redisCache.flushAll();
            }
            catch (error) {
                this.logger.warn(`[HybridCache] Redis flushAll 失败: ${error.message}`);
            }
        }
        this.memoryCache.clear();
        this.logger.log('[HybridCache] 所有缓存已清空');
        return redisSuccess || true;
    }
    getFromMemory(key) {
        const cached = this.memoryCache.get(key);
        if (!cached) {
            return null;
        }
        if (Date.now() > cached.expiry) {
            this.memoryCache.delete(key);
            return null;
        }
        this.logger.debug(`[HybridCache] Memory hit: ${key}`);
        return cached.data;
    }
    setToMemory(key, value, ttlSeconds) {
        const expiry = Date.now() + ttlSeconds * 1000;
        this.memoryCache.set(key, { data: value, expiry });
        this.logger.debug(`[HybridCache] Memory set: ${key} (TTL: ${ttlSeconds}s)`);
    }
    getStats() {
        var _a;
        return {
            memorySize: this.memoryCache.size,
            redisConnected: ((_a = this.redisCache) === null || _a === void 0 ? void 0 : _a.isReady()) || false,
        };
    }
    cleanupExpired() {
        let count = 0;
        const now = Date.now();
        for (const [key, cached] of this.memoryCache.entries()) {
            if (now > cached.expiry) {
                this.memoryCache.delete(key);
                count++;
            }
        }
        if (count > 0) {
            this.logger.debug(`[HybridCache] 清理了 ${count} 个过期内存缓存`);
        }
        return count;
    }
};
exports.HybridCacheService = HybridCacheService;
exports.HybridCacheService = HybridCacheService = HybridCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_cache_service_1.RedisCacheService,
        rag_metrics_service_1.RagMetricsService])
], HybridCacheService);
//# sourceMappingURL=hybrid-cache.service.js.map