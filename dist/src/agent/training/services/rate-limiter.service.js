"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RateLimiterService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RateLimiterService = void 0;
const common_1 = require("@nestjs/common");
let RateLimiterService = RateLimiterService_1 = class RateLimiterService {
    constructor() {
        this.logger = new common_1.Logger(RateLimiterService_1.name);
        this.buckets = new Map();
    }
    async checkRateLimit(key, config) {
        const bucket = this.getOrCreateBucket(key, config);
        const now = Date.now();
        const elapsed = now - bucket.lastRefillTime;
        const tokensToAdd = Math.floor((elapsed / 1000) * config.refillRate);
        bucket.tokens = Math.min(config.capacity, bucket.tokens + tokensToAdd);
        bucket.lastRefillTime = now;
        if (bucket.tokens >= 1) {
            bucket.tokens -= 1;
            return {
                allowed: true,
                remaining: Math.floor(bucket.tokens),
            };
        }
        else {
            return {
                allowed: false,
                remaining: 0,
            };
        }
    }
    getOrCreateBucket(key, config) {
        if (!this.buckets.has(key)) {
            this.buckets.set(key, {
                key,
                tokens: config.capacity,
                lastRefillTime: Date.now(),
            });
        }
        return this.buckets.get(key);
    }
    getRemainingTokens(key) {
        const bucket = this.buckets.get(key);
        return bucket ? Math.floor(bucket.tokens) : 0;
    }
    reset(key) {
        this.buckets.delete(key);
    }
};
exports.RateLimiterService = RateLimiterService;
exports.RateLimiterService = RateLimiterService = RateLimiterService_1 = __decorate([
    (0, common_1.Injectable)()
], RateLimiterService);
//# sourceMappingURL=rate-limiter.service.js.map