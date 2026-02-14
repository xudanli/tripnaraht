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
var ValidationCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../redis/redis.service");
const kpu_monitoring_service_1 = require("./kpu-monitoring.service");
const crypto = __importStar(require("crypto"));
let ValidationCacheService = ValidationCacheService_1 = class ValidationCacheService {
    constructor(redisService, monitoringService) {
        this.redisService = redisService;
        this.monitoringService = monitoringService;
        this.logger = new common_1.Logger(ValidationCacheService_1.name);
        this.TTL = 3600;
        this.memoryCache = new Map();
    }
    hashContent(content) {
        return crypto.createHash('sha256').update(content).digest('hex').substring(0, 16);
    }
    async getCachedSnippetValidation(content) {
        const hash = this.hashContent(content);
        const key = `kpu:snippet:${hash}`;
        const memoryCached = this.memoryCache.get(key);
        if (memoryCached && memoryCached.expiresAt > Date.now()) {
            this.logger.debug(`从内存缓存获取片段验证结果: ${hash}`);
            if (this.monitoringService) {
                this.monitoringService.recordCacheHit();
            }
            return memoryCached.result;
        }
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(key);
                if (cached && typeof cached === 'string') {
                    const result = JSON.parse(cached);
                    this.memoryCache.set(key, {
                        result,
                        expiresAt: Date.now() + this.TTL * 1000,
                    });
                    this.logger.debug(`从Redis缓存获取片段验证结果: ${hash}`);
                    if (this.monitoringService) {
                        this.monitoringService.recordCacheHit();
                    }
                    return result;
                }
            }
            catch (error) {
                this.logger.warn(`Redis缓存读取失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        if (this.monitoringService) {
            this.monitoringService.recordCacheMiss();
        }
        return null;
    }
    async cacheSnippetValidation(content, result) {
        const hash = this.hashContent(content);
        const key = `kpu:snippet:${hash}`;
        this.memoryCache.set(key, {
            result,
            expiresAt: Date.now() + this.TTL * 1000,
        });
        if (this.redisService) {
            try {
                await this.redisService.set(key, JSON.stringify(result), this.TTL);
            }
            catch (error) {
                this.logger.warn(`Redis缓存写入失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        if (this.memoryCache.size > 1000) {
            this.cleanExpiredMemoryCache();
        }
    }
    async getCachedOutputValidation(output) {
        const hash = this.hashContent(output);
        const key = `kpu:output:${hash}`;
        const memoryCached = this.memoryCache.get(key);
        if (memoryCached && memoryCached.expiresAt > Date.now()) {
            this.logger.debug(`从内存缓存获取输出验证结果: ${hash}`);
            if (this.monitoringService) {
                this.monitoringService.recordCacheHit();
            }
            return memoryCached.result;
        }
        if (this.redisService) {
            try {
                const cached = await this.redisService.get(key);
                if (cached && typeof cached === 'string') {
                    const result = JSON.parse(cached);
                    this.memoryCache.set(key, {
                        result,
                        expiresAt: Date.now() + this.TTL * 1000,
                    });
                    this.logger.debug(`从Redis缓存获取输出验证结果: ${hash}`);
                    if (this.monitoringService) {
                        this.monitoringService.recordCacheHit();
                    }
                    return result;
                }
            }
            catch (error) {
                this.logger.warn(`Redis缓存读取失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        if (this.monitoringService) {
            this.monitoringService.recordCacheMiss();
        }
        return null;
    }
    async cacheOutputValidation(output, result) {
        const hash = this.hashContent(output);
        const key = `kpu:output:${hash}`;
        this.memoryCache.set(key, {
            result,
            expiresAt: Date.now() + this.TTL * 1000,
        });
        if (this.redisService) {
            try {
                await this.redisService.set(key, JSON.stringify(result), this.TTL);
            }
            catch (error) {
                this.logger.warn(`Redis缓存写入失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        if (this.memoryCache.size > 1000) {
            this.cleanExpiredMemoryCache();
        }
    }
    cleanExpiredMemoryCache() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, value] of this.memoryCache.entries()) {
            if (value.expiresAt <= now) {
                this.memoryCache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.debug(`清理了 ${cleaned} 个过期的内存缓存项`);
        }
    }
    async clearCache() {
        this.memoryCache.clear();
        this.logger.debug('已清除内存缓存（Redis缓存需要直接操作Redis客户端清除）');
    }
};
exports.ValidationCacheService = ValidationCacheService;
exports.ValidationCacheService = ValidationCacheService = ValidationCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        kpu_monitoring_service_1.KPUMonitoringService])
], ValidationCacheService);
//# sourceMappingURL=validation-cache.service.js.map