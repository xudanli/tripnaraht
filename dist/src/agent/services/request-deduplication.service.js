"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RequestDeduplicationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestDeduplicationService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let RequestDeduplicationService = RequestDeduplicationService_1 = class RequestDeduplicationService {
    constructor() {
        this.logger = new common_1.Logger(RequestDeduplicationService_1.name);
        this.dedupCache = new Map();
        this.defaultTTL = 5 * 1000;
        this.maxCacheSize = 500;
    }
    generateRequestHash(request) {
        var _a, _b, _c, _d;
        const keyData = {
            message: request.message,
            user_id: request.user_id,
            trip_id: request.trip_id,
            options: {
                dry_run: (_a = request.options) === null || _a === void 0 ? void 0 : _a.dry_run,
                allow_webbrowse: (_b = request.options) === null || _b === void 0 ? void 0 : _b.allow_webbrowse,
            },
            context: ((_d = (_c = request.conversation_context) === null || _c === void 0 ? void 0 : _c.recent_messages) === null || _d === void 0 ? void 0 : _d.slice(-3)) || [],
        };
        const keyStr = JSON.stringify(keyData, this.sortKeys);
        const hash = (0, crypto_1.createHash)('sha256').update(keyStr).digest('hex');
        return hash.substring(0, 32);
    }
    checkDuplicate(requestHash) {
        const cached = this.dedupCache.get(requestHash);
        if (!cached) {
            return null;
        }
        const age = Date.now() - cached.timestamp;
        if (age > this.defaultTTL) {
            this.dedupCache.delete(requestHash);
            this.logger.debug(`Dedup cache expired for hash: ${requestHash.substring(0, 8)}...`);
            return null;
        }
        cached.requestCount++;
        this.logger.debug(`Duplicate request detected (hash: ${requestHash.substring(0, 8)}...), ` +
            `reusing result (count: ${cached.requestCount})`);
        return cached.response;
    }
    cacheResponse(requestHash, response) {
        if (this.dedupCache.size >= this.maxCacheSize) {
            this.evictOldest();
        }
        const cacheItem = {
            requestHash,
            response: { ...response },
            timestamp: Date.now(),
            requestCount: 1,
        };
        this.dedupCache.set(requestHash, cacheItem);
        this.logger.debug(`Cached response for deduplication (hash: ${requestHash.substring(0, 8)}...)`);
    }
    getStats() {
        let totalRequests = 0;
        let dedupedRequests = 0;
        for (const item of this.dedupCache.values()) {
            totalRequests += item.requestCount;
            if (item.requestCount > 1) {
                dedupedRequests += item.requestCount - 1;
            }
        }
        return {
            cacheSize: this.dedupCache.size,
            totalRequests,
            dedupedRequests,
        };
    }
    clear() {
        this.dedupCache.clear();
        this.logger.debug('Deduplication cache cleared');
    }
    cleanupExpired() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [hash, item] of this.dedupCache.entries()) {
            if (now - item.timestamp > this.defaultTTL) {
                this.dedupCache.delete(hash);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.logger.debug(`Cleaned up ${cleanedCount} expired deduplication cache entries`);
        }
        return cleanedCount;
    }
    evictOldest() {
        if (this.dedupCache.size === 0) {
            return;
        }
        let oldestHash = null;
        let oldestTimestamp = Infinity;
        for (const [hash, item] of this.dedupCache.entries()) {
            if (item.timestamp < oldestTimestamp) {
                oldestTimestamp = item.timestamp;
                oldestHash = hash;
            }
        }
        if (oldestHash) {
            this.dedupCache.delete(oldestHash);
            this.logger.debug(`Evicted oldest dedup cache entry: ${oldestHash.substring(0, 8)}...`);
        }
    }
    sortKeys(key, value) {
        if (value instanceof Object && !Array.isArray(value)) {
            const sortedObj = {};
            Object.keys(value)
                .sort()
                .forEach(k => {
                sortedObj[k] = value[k];
            });
            return sortedObj;
        }
        return value;
    }
};
exports.RequestDeduplicationService = RequestDeduplicationService;
exports.RequestDeduplicationService = RequestDeduplicationService = RequestDeduplicationService_1 = __decorate([
    (0, common_1.Injectable)()
], RequestDeduplicationService);
//# sourceMappingURL=request-deduplication.service.js.map