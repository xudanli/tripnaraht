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
var CacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
let CacheService = CacheService_1 = class CacheService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(CacheService_1.name);
        this.memoryCache = new Map();
        if (this.redisService) {
            this.logger.log('✅ 缓存服务已启用（Redis）');
        }
        else {
            this.logger.warn('⚠️ Redis服务不可用，使用内存缓存（重启后数据会丢失）');
        }
    }
    async get(key) {
        try {
            if (this.redisService) {
                const value = await this.redisService.get(key);
                if (value !== undefined && value !== null) {
                    return value;
                }
            }
            const memoryEntry = this.memoryCache.get(key);
            if (memoryEntry && Date.now() < memoryEntry.expiry) {
                return memoryEntry.data;
            }
            else if (memoryEntry) {
                this.memoryCache.delete(key);
            }
            return null;
        }
        catch (error) {
            this.logger.warn(`缓存获取失败: key=${key}, error=${error.message}`);
            const memoryEntry = this.memoryCache.get(key);
            if (memoryEntry && Date.now() < memoryEntry.expiry) {
                return memoryEntry.data;
            }
            return null;
        }
    }
    async set(key, value, ttl) {
        try {
            if (this.redisService) {
                await this.redisService.set(key, value, ttl);
            }
            const expiry = Date.now() + ttl * 1000;
            this.memoryCache.set(key, { data: value, expiry });
            this.cleanupExpiredEntries();
        }
        catch (error) {
            this.logger.warn(`缓存设置失败: key=${key}, error=${error.message}`);
            const expiry = Date.now() + ttl * 1000;
            this.memoryCache.set(key, { data: value, expiry });
        }
    }
    async delete(key) {
        try {
            if (this.redisService) {
                await this.redisService.del(key);
            }
            this.memoryCache.delete(key);
        }
        catch (error) {
            this.logger.warn(`缓存删除失败: key=${key}, error=${error.message}`);
            this.memoryCache.delete(key);
        }
    }
    async exists(key) {
        try {
            if (this.redisService) {
                return await this.redisService.exists(key);
            }
            const memoryEntry = this.memoryCache.get(key);
            return memoryEntry !== undefined && Date.now() < memoryEntry.expiry;
        }
        catch (error) {
            this.logger.warn(`缓存存在检查失败: key=${key}, error=${error.message}`);
            return false;
        }
    }
    generateKey(prefix, ...parts) {
        if (this.redisService) {
            return this.redisService.generateKey(prefix, ...parts);
        }
        return `${prefix}:${parts.join(':')}`;
    }
    cleanupExpiredEntries() {
        if (Math.random() < 0.01) {
            const now = Date.now();
            for (const [key, entry] of this.memoryCache.entries()) {
                if (now >= entry.expiry) {
                    this.memoryCache.delete(key);
                }
            }
        }
    }
    clear() {
        this.memoryCache.clear();
        this.logger.log('内存缓存已清空');
    }
};
exports.CacheService = CacheService;
exports.CacheService = CacheService = CacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], CacheService);
//# sourceMappingURL=cache.service.js.map