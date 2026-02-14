"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var TravelTimeCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelTimeCacheService = void 0;
const common_1 = require("@nestjs/common");
let TravelTimeCacheService = TravelTimeCacheService_1 = class TravelTimeCacheService {
    constructor() {
        this.logger = new common_1.Logger(TravelTimeCacheService_1.name);
        this.cache = new Map();
        this.TTL_MS = 2 * 60 * 60 * 1000;
        this.MAX_ENTRIES = 1000;
    }
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) {
            return undefined;
        }
        if (Date.now() - cached.cachedAt > this.TTL_MS) {
            this.cache.delete(key);
            return undefined;
        }
        const { cachedAt, ...data } = cached;
        return data;
    }
    set(key, value) {
        if (this.cache.size >= this.MAX_ENTRIES) {
            this.cleanup();
        }
        this.cache.set(key, {
            ...value,
            cachedAt: Date.now(),
        });
    }
    clear() {
        this.cache.clear();
        this.logger.log('缓存已清空');
    }
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.MAX_ENTRIES,
            ttlMs: this.TTL_MS,
        };
    }
    cleanup() {
        const now = Date.now();
        const entries = Array.from(this.cache.entries());
        let deleted = 0;
        for (const [key, value] of entries) {
            if (now - value.cachedAt > this.TTL_MS) {
                this.cache.delete(key);
                deleted++;
            }
        }
        if (this.cache.size >= this.MAX_ENTRIES) {
            const remaining = Array.from(this.cache.entries())
                .sort((a, b) => a[1].cachedAt - b[1].cachedAt);
            const toDelete = Math.floor(remaining.length / 2);
            for (let i = 0; i < toDelete; i++) {
                this.cache.delete(remaining[i][0]);
                deleted++;
            }
        }
        if (deleted > 0) {
            this.logger.debug(`清理了 ${deleted} 条缓存`);
        }
    }
};
exports.TravelTimeCacheService = TravelTimeCacheService;
exports.TravelTimeCacheService = TravelTimeCacheService = TravelTimeCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], TravelTimeCacheService);
//# sourceMappingURL=travel-time-cache.service.js.map