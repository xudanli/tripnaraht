"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var FusionResourceManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FusionResourceManagerService = void 0;
const common_1 = require("@nestjs/common");
let FusionResourceManagerService = FusionResourceManagerService_1 = class FusionResourceManagerService {
    constructor() {
        this.logger = new common_1.Logger(FusionResourceManagerService_1.name);
        this.cacheSizeLimit = 1000;
        this.cacheAccessOrder = new Map();
        this.accessCounter = 0;
        this.maxConcurrency = 10;
        this.currentConcurrency = 0;
        this.concurrencyQueue = [];
        this.rateLimitTokens = 100;
        this.currentTokens = this.rateLimitTokens;
        this.tokenRefillRate = 10;
        this.lastRefillTime = Date.now();
    }
    updateCacheAccess(key, cache) {
        this.accessCounter++;
        this.cacheAccessOrder.set(key, this.accessCounter);
        if (cache.size > this.cacheSizeLimit) {
            this.evictLRUEntries(cache);
        }
    }
    evictLRUEntries(cache) {
        let oldestKey = null;
        let oldestAccess = Infinity;
        for (const [key, accessTime] of this.cacheAccessOrder.entries()) {
            if (accessTime < oldestAccess && cache.has(key)) {
                oldestAccess = accessTime;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            cache.delete(oldestKey);
            this.cacheAccessOrder.delete(oldestKey);
            this.logger.debug(`Evicted LRU cache entry: ${oldestKey}`);
        }
    }
    async acquireConcurrency() {
        return new Promise((resolve, reject) => {
            if (this.currentConcurrency < this.maxConcurrency) {
                this.currentConcurrency++;
                resolve();
            }
            else {
                this.concurrencyQueue.push({ resolve, reject });
                setTimeout(() => {
                    const index = this.concurrencyQueue.findIndex(item => item.resolve === resolve);
                    if (index >= 0) {
                        this.concurrencyQueue.splice(index, 1);
                        reject(new Error('Concurrency acquisition timeout'));
                    }
                }, 30000);
            }
        });
    }
    releaseConcurrency() {
        this.currentConcurrency--;
        if (this.concurrencyQueue.length > 0) {
            const next = this.concurrencyQueue.shift();
            if (next) {
                this.currentConcurrency++;
                next.resolve();
            }
        }
    }
    async acquireRateLimitToken() {
        this.refillTokens();
        if (this.currentTokens > 0) {
            this.currentTokens--;
            return;
        }
        const waitTime = Math.ceil((1 - this.currentTokens) / this.tokenRefillRate * 1000);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.refillTokens();
        if (this.currentTokens > 0) {
            this.currentTokens--;
        }
        else {
            throw new Error('Rate limit exceeded');
        }
    }
    refillTokens() {
        const now = Date.now();
        const elapsed = (now - this.lastRefillTime) / 1000;
        const tokensToAdd = Math.floor(elapsed * this.tokenRefillRate);
        if (tokensToAdd > 0) {
            this.currentTokens = Math.min(this.rateLimitTokens, this.currentTokens + tokensToAdd);
            this.lastRefillTime = now;
        }
    }
    getResourceStats() {
        return {
            cacheSize: this.cacheAccessOrder.size,
            currentConcurrency: this.currentConcurrency,
            maxConcurrency: this.maxConcurrency,
            queueLength: this.concurrencyQueue.length,
            currentTokens: this.currentTokens,
            maxTokens: this.rateLimitTokens,
        };
    }
};
exports.FusionResourceManagerService = FusionResourceManagerService;
exports.FusionResourceManagerService = FusionResourceManagerService = FusionResourceManagerService_1 = __decorate([
    (0, common_1.Injectable)()
], FusionResourceManagerService);
//# sourceMappingURL=fusion-resource-manager.service.js.map