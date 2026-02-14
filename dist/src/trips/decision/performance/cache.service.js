"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var DecisionCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionCacheService = void 0;
const common_1 = require("@nestjs/common");
let DecisionCacheService = DecisionCacheService_1 = class DecisionCacheService {
    constructor() {
        this.logger = new common_1.Logger(DecisionCacheService_1.name);
        this.cache = new Map();
    }
    cachePlan(stateKey, plan, ttl = 3600000) {
        this.cache.set(stateKey, {
            key: stateKey,
            value: plan,
            timestamp: Date.now(),
            ttl,
        });
    }
    getCachedPlan(stateKey) {
        const entry = this.cache.get(stateKey);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(stateKey);
            return null;
        }
        return entry.value;
    }
    generateStateKey(state) {
        const keyParts = [
            state.context.destination,
            state.context.startDate,
            state.context.durationDays.toString(),
            state.context.preferences.pace,
            JSON.stringify(state.context.preferences.intents),
            state.signals.lastUpdatedAt,
        ];
        return this.hashString(keyParts.join('|'));
    }
    cacheIntermediateResult(key, result, ttl = 1800000) {
        this.cache.set(key, {
            key,
            value: result,
            timestamp: Date.now(),
            ttl,
        });
    }
    getCachedIntermediateResult(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            return null;
        }
        if (Date.now() - entry.timestamp > entry.ttl) {
            this.cache.delete(key);
            return null;
        }
        return entry.value;
    }
    cleanupExpired() {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, entry] of this.cache.entries()) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
                cleaned++;
            }
        }
        if (cleaned > 0) {
            this.logger.debug(`Cleaned ${cleaned} expired cache entries`);
        }
    }
    clear() {
        this.cache.clear();
        this.logger.debug('Cache cleared');
    }
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }
};
exports.DecisionCacheService = DecisionCacheService;
exports.DecisionCacheService = DecisionCacheService = DecisionCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], DecisionCacheService);
//# sourceMappingURL=cache.service.js.map