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
var RateLimitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimitService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_service_1 = require("../../redis/redis.service");
let RateLimitService = RateLimitService_1 = class RateLimitService {
    constructor(redisService, configService) {
        this.redisService = redisService;
        this.configService = configService;
        this.logger = new common_1.Logger(RateLimitService_1.name);
        this.anonymousLimit = 3;
        this.anonymousWindowMs = 60 * 60 * 1000;
        this.authenticatedLimit = 10;
        this.authenticatedWindowMs = 60 * 60 * 1000;
    }
    async checkRateLimit(userId, ipAddress) {
        const isAuthenticated = !!userId;
        const limit = isAuthenticated ? this.authenticatedLimit : this.anonymousLimit;
        const windowMs = isAuthenticated ? this.authenticatedWindowMs : this.anonymousWindowMs;
        const key = userId
            ? this.redisService.generateKey('contact:rate_limit:user', userId)
            : this.redisService.generateKey('contact:rate_limit:ip', ipAddress || 'unknown');
        const currentCount = await this.redisService.get(key) || 0;
        if (currentCount >= limit) {
            const resetTime = new Date(Date.now() + windowMs);
            throw new common_1.HttpException({
                success: false,
                error: {
                    code: 'RATE_LIMIT_EXCEEDED',
                    message: '发送消息过于频繁，请稍后再试',
                    details: {
                        resetTime: resetTime.toISOString(),
                    },
                },
            }, common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const newCount = currentCount + 1;
        await this.redisService.set(key, newCount, Math.floor(windowMs / 1000));
        this.logger.debug(`限流检查通过: key=${key}, count=${newCount}/${limit}`);
    }
    async getRateLimitInfo(userId, ipAddress) {
        const isAuthenticated = !!userId;
        const limit = isAuthenticated ? this.authenticatedLimit : this.anonymousLimit;
        const windowMs = isAuthenticated ? this.authenticatedWindowMs : this.anonymousWindowMs;
        const key = userId
            ? this.redisService.generateKey('contact:rate_limit:user', userId)
            : this.redisService.generateKey('contact:rate_limit:ip', ipAddress || 'unknown');
        const currentCount = await this.redisService.get(key) || 0;
        const remaining = Math.max(0, limit - currentCount);
        const resetTime = new Date(Date.now() + windowMs);
        return {
            limit,
            remaining,
            resetTime,
        };
    }
};
exports.RateLimitService = RateLimitService;
exports.RateLimitService = RateLimitService = RateLimitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        config_1.ConfigService])
], RateLimitService);
//# sourceMappingURL=rate-limit.service.js.map