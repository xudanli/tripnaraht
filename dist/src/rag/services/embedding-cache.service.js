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
var EmbeddingCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmbeddingCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const crypto = __importStar(require("crypto"));
let EmbeddingCacheService = EmbeddingCacheService_1 = class EmbeddingCacheService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(EmbeddingCacheService_1.name);
        this.CACHE_PREFIX = 'embedding';
        this.DEFAULT_TTL = 86400;
        this.memoryCache = new Map();
        this.stats = {
            hits: 0,
            misses: 0,
            totalLatencyMs: 0,
            requestCount: 0,
        };
        if (!redisService) {
            this.logger.warn('RedisService not available, using in-memory cache only');
        }
        else {
            this.logger.log('✅ Embedding缓存服务已启用（Redis）');
        }
    }
    generateCacheKey(text) {
        const hash = crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
        return `${this.CACHE_PREFIX}:${hash}`;
    }
    async get(text) {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(text);
        try {
            if (this.redisService) {
                const cached = await this.redisService.get(cacheKey);
                if (cached) {
                    const latency = Date.now() - startTime;
                    this.recordHit(latency);
                    this.logger.debug(`✅ Embedding缓存命中: ${text.substring(0, 50)}... (${latency}ms)`);
                    return cached;
                }
            }
            const memoryCached = this.memoryCache.get(cacheKey);
            if (memoryCached && memoryCached.expires > Date.now()) {
                const latency = Date.now() - startTime;
                this.recordHit(latency);
                this.logger.debug(`✅ Embedding内存缓存命中: ${text.substring(0, 50)}... (${latency}ms)`);
                return memoryCached.embedding;
            }
            const latency = Date.now() - startTime;
            this.recordMiss(latency);
            this.logger.debug(`❌ Embedding缓存未命中: ${text.substring(0, 50)}... (${latency}ms)`);
            return null;
        }
        catch (error) {
            this.logger.warn(`获取缓存失败: ${error.message}`);
            this.recordMiss(Date.now() - startTime);
            return null;
        }
    }
    async set(text, embedding, ttl = this.DEFAULT_TTL) {
        const cacheKey = this.generateCacheKey(text);
        const expires = Date.now() + ttl * 1000;
        this.memoryCache.set(cacheKey, { embedding, expires });
        this.logger.debug(`💾 Embedding已写入内存缓存: ${text.substring(0, 50)}... (TTL: ${ttl}s)`);
        if (this.redisService) {
            this.redisService.set(cacheKey, embedding, ttl).then(() => {
                this.logger.debug(`💾 Embedding已缓存到Redis: ${text.substring(0, 50)}... (TTL: ${ttl}s)`);
            }).catch((error) => {
                this.logger.warn(`Redis缓存写入失败（已写入内存缓存）: ${error.message}`);
            });
        }
        if (this.memoryCache.size > 1000) {
            this.cleanExpiredMemoryCache();
        }
    }
    async delete(text) {
        const cacheKey = this.generateCacheKey(text);
        try {
            if (this.redisService) {
                await this.redisService.del(cacheKey);
            }
            this.memoryCache.delete(cacheKey);
            this.logger.debug(`🗑️  Embedding缓存已删除: ${text.substring(0, 50)}...`);
        }
        catch (error) {
            this.logger.warn(`删除缓存失败: ${error.message}`);
        }
    }
    async clear() {
        try {
            this.memoryCache.clear();
            this.logger.warn('⚠️  内存缓存已清空，Redis缓存需要手动清空');
        }
        catch (error) {
            this.logger.error(`清空缓存失败: ${error.message}`);
        }
    }
    getStats() {
        const totalRequests = this.stats.hits + this.stats.misses;
        const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
        const avgLatencyMs = this.stats.requestCount > 0
            ? this.stats.totalLatencyMs / this.stats.requestCount
            : 0;
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate,
            totalRequests,
            cacheSize: this.memoryCache.size,
            avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
        };
    }
    resetStats() {
        this.stats = {
            hits: 0,
            misses: 0,
            totalLatencyMs: 0,
            requestCount: 0,
        };
    }
    recordHit(latencyMs) {
        this.stats.hits++;
        this.stats.requestCount++;
        this.stats.totalLatencyMs += latencyMs;
    }
    recordMiss(latencyMs) {
        this.stats.misses++;
        this.stats.requestCount++;
        this.stats.totalLatencyMs += latencyMs;
    }
    cleanExpiredMemoryCache() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.memoryCache.entries()) {
            if (value.expires <= now) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.debug(`🧹 清理了 ${cleaned} 个过期的内存缓存项`);
        }
    }
};
exports.EmbeddingCacheService = EmbeddingCacheService;
exports.EmbeddingCacheService = EmbeddingCacheService = EmbeddingCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], EmbeddingCacheService);
//# sourceMappingURL=embedding-cache.service.js.map