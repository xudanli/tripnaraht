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
var ReadinessCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadinessCacheService = void 0;
const common_1 = require("@nestjs/common");
const redis_service_1 = require("../../../redis/redis.service");
const crypto = __importStar(require("crypto"));
let ReadinessCacheService = ReadinessCacheService_1 = class ReadinessCacheService {
    constructor(redisService) {
        this.redisService = redisService;
        this.logger = new common_1.Logger(ReadinessCacheService_1.name);
        this.memoryCache = new Map();
        this.L1_TTL_MS = 5 * 60 * 1000;
        this.CACHE_VERSION_KEY = 'readiness:cache:version';
        if (!redisService) {
            this.logger.warn('RedisService not available, using L1 cache only');
        }
    }
    async get(key) {
        const l1Entry = this.memoryCache.get(key);
        if (l1Entry && Date.now() - l1Entry.timestamp < this.L1_TTL_MS) {
            if (await this.checkCacheVersion(key, l1Entry)) {
                return l1Entry.data;
            }
            else {
                this.memoryCache.delete(key);
            }
        }
        if (this.redisService) {
            try {
                const l2Data = await this.redisService.get(key);
                if (l2Data) {
                    if (await this.checkCacheVersion(key, l2Data)) {
                        this.memoryCache.set(key, {
                            data: l2Data.data,
                            timestamp: Date.now(),
                            cacheVersion: l2Data.cacheVersion,
                        });
                        return l2Data.data;
                    }
                    else {
                        await this.redisService.del(key);
                    }
                }
            }
            catch (error) {
                this.logger.warn(`Redis cache get failed for key: ${key}`, error);
            }
        }
        return null;
    }
    async set(key, data, options = {}) {
        const ttl = options.ttl || 24 * 60 * 60;
        const version = await this.getCacheVersion();
        const cacheEntry = {
            data,
            timestamp: Date.now(),
            cacheVersion: version.version,
        };
        this.memoryCache.set(key, cacheEntry);
        if (this.redisService) {
            try {
                await this.redisService.set(key, cacheEntry, ttl);
            }
            catch (error) {
                this.logger.warn(`Redis cache set failed for key: ${key}`, error);
            }
        }
    }
    async del(key) {
        this.memoryCache.delete(key);
        if (this.redisService) {
            try {
                await this.redisService.del(key);
            }
            catch (error) {
                this.logger.warn(`Redis cache del failed for key: ${key}`, error);
            }
        }
    }
    generateCacheKey(type, baseResult, userProfile) {
        const hash = crypto
            .createHash('sha256')
            .update(JSON.stringify({
            type,
            tripId: baseResult.tripId,
            userProfileHash: userProfile ? this.hashUserProfile(userProfile) : 'anonymous',
            resultHash: this.hashResult(baseResult),
        }))
            .digest('hex');
        return `readiness:${type}:${hash}`;
    }
    hashUserProfile(userProfile) {
        var _a;
        return crypto
            .createHash('sha256')
            .update(JSON.stringify({
            userId: userProfile.userId,
            nationality: userProfile.nationality,
            budgetLevel: userProfile.budgetLevel,
            riskTolerance: userProfile.riskTolerance,
            tags: (_a = userProfile.tags) === null || _a === void 0 ? void 0 : _a.sort(),
        }))
            .digest('hex')
            .substring(0, 16);
    }
    hashResult(result) {
        return crypto
            .createHash('sha256')
            .update(JSON.stringify({
            totalBlockers: result.summary.totalBlockers,
            totalMust: result.summary.totalMust,
            findings: result.findings.map(f => ({
                destinationId: f.destinationId,
                packId: f.packId,
                packVersion: f.packVersion,
            })),
        }))
            .digest('hex')
            .substring(0, 16);
    }
    async getCacheVersion() {
        if (this.redisService) {
            try {
                const version = await this.redisService.get(this.CACHE_VERSION_KEY);
                if (version) {
                    return version;
                }
            }
            catch (error) {
                this.logger.warn('Failed to get cache version from Redis', error);
            }
        }
        return {
            version: 'v1.0.0',
            timestamp: Date.now(),
            rulesEngineVersion: 'latest',
        };
    }
    async updateCacheVersion(rulesEngineVersion) {
        const currentVersion = await this.getCacheVersion();
        const newVersion = {
            version: this.incrementVersion(currentVersion.version),
            timestamp: Date.now(),
            rulesEngineVersion: rulesEngineVersion || currentVersion.rulesEngineVersion,
        };
        if (this.redisService) {
            try {
                await this.redisService.set(this.CACHE_VERSION_KEY, newVersion, 365 * 24 * 60 * 60);
            }
            catch (error) {
                this.logger.warn('Failed to update cache version in Redis', error);
            }
        }
    }
    async checkCacheVersion(key, entry) {
        if (!entry.cacheVersion) {
            return true;
        }
        const currentVersion = await this.getCacheVersion();
        if (entry.cacheVersion !== currentVersion.version) {
            await this.del(key);
            return false;
        }
        return true;
    }
    incrementVersion(version) {
        const match = version.match(/^v(\d+)\.(\d+)\.(\d+)$/);
        if (match) {
            const [, major, minor, patch] = match;
            return `v${major}.${minor}.${parseInt(patch) + 1}`;
        }
        return `v1.0.${Date.now()}`;
    }
    async invalidateAll(reason) {
        this.logger.log(`Invalidating all readiness caches, reason: ${reason}`);
        await this.updateCacheVersion();
        this.memoryCache.clear();
    }
};
exports.ReadinessCacheService = ReadinessCacheService;
exports.ReadinessCacheService = ReadinessCacheService = ReadinessCacheService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [redis_service_1.RedisService])
], ReadinessCacheService);
//# sourceMappingURL=readiness-cache.service.js.map