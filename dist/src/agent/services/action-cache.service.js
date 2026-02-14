"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ActionCacheService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionCacheService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let ActionCacheService = ActionCacheService_1 = class ActionCacheService {
    constructor() {
        this.logger = new common_1.Logger(ActionCacheService_1.name);
        this.cache = new Map();
        this.defaultTTL = 5 * 60 * 1000;
        this.maxCacheSize = 1000;
        this.resolverVersion = 'v3';
    }
    generateCacheKey(actionName, input, customKey) {
        if (customKey) {
            return this.processCustomCacheKey(customKey, input);
        }
        const normalizedInput = this.normalizeInput(input);
        const inputStr = this.stableStringify(normalizedInput);
        if (actionName === 'places.resolve_entities') {
            this.logger.debug(`[CacheKey] action: ${actionName}, normalizedInput: ${JSON.stringify(normalizedInput)}, inputStr: ${inputStr.substring(0, 100)}...`);
        }
        const versionSuffix = actionName === 'places.resolve_entities' ? `:${this.resolverVersion}` : '';
        const hash = (0, crypto_1.createHash)('sha256')
            .update(`${actionName}:${inputStr}${versionSuffix}`)
            .digest('hex');
        const key = `${actionName}:${hash.substring(0, 16)}${versionSuffix}`;
        if (actionName === 'places.resolve_entities') {
            this.logger.debug(`[CacheKey] Generated key: ${key} (resolver version: ${this.resolverVersion})`);
        }
        return key;
    }
    normalizeInput(input) {
        if (!input || typeof input !== 'object') {
            return input;
        }
        const normalized = {};
        for (const [key, value] of Object.entries(input)) {
            if (key === 'state' || key === 'request_id' || key === 'timestamp' ||
                key === 'requestId' || key === 'timestamp_ms' || key === '_timestamp') {
                continue;
            }
            if (typeof value === 'function' || value === undefined) {
                continue;
            }
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const normalizedValue = this.normalizeInput(value);
                if (Object.keys(normalizedValue).length > 0) {
                    normalized[key] = normalizedValue;
                }
            }
            else {
                normalized[key] = value;
            }
        }
        return normalized;
    }
    stableStringify(obj) {
        if (obj === null || obj === undefined) {
            return String(obj);
        }
        if (typeof obj !== 'object') {
            return JSON.stringify(obj);
        }
        if (Array.isArray(obj)) {
            return '[' + obj.map(item => this.stableStringify(item)).join(',') + ']';
        }
        const sortedKeys = Object.keys(obj).sort();
        const pairs = sortedKeys.map(key => {
            return JSON.stringify(key) + ':' + this.stableStringify(obj[key]);
        });
        return '{' + pairs.join(',') + '}';
    }
    processCustomCacheKey(customKey, input) {
        let processedKey = customKey;
        const placeholderRegex = /\{(\w+)\}/g;
        processedKey = processedKey.replace(placeholderRegex, (match, key) => {
            return input[key] !== undefined ? String(input[key]) : match;
        });
        return processedKey;
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            return null;
        }
        if (item.ttl && Date.now() - item.timestamp > item.ttl) {
            this.cache.delete(key);
            this.logger.debug(`Cache expired for key: ${key}`);
            return null;
        }
        this.logger.debug(`Cache hit for key: ${key}`);
        return item.value;
    }
    set(key, value, ttl) {
        if (this.cache.size >= this.maxCacheSize) {
            this.evictOldest();
        }
        const item = {
            key,
            value,
            timestamp: Date.now(),
            ttl: ttl || this.defaultTTL,
        };
        this.cache.set(key, item);
        this.logger.debug(`Cache set for key: ${key}, TTL: ${item.ttl}ms`);
    }
    delete(key) {
        this.cache.delete(key);
        this.logger.debug(`Cache deleted for key: ${key}`);
    }
    clear() {
        this.cache.clear();
        this.logger.debug('Cache cleared');
    }
    deleteByPattern(pattern) {
        let deletedCount = 0;
        for (const key of this.cache.keys()) {
            if (key.startsWith(pattern)) {
                this.cache.delete(key);
                deletedCount++;
            }
        }
        if (deletedCount > 0) {
            this.logger.debug(`Deleted ${deletedCount} cache entries matching pattern: ${pattern}`);
        }
    }
    getStats() {
        return {
            size: this.cache.size,
            maxSize: this.maxCacheSize,
        };
    }
    evictOldest() {
        if (this.cache.size === 0) {
            return;
        }
        let oldestKey = null;
        let oldestTimestamp = Infinity;
        for (const [key, item] of this.cache.entries()) {
            if (item.timestamp < oldestTimestamp) {
                oldestTimestamp = item.timestamp;
                oldestKey = key;
            }
        }
        if (oldestKey) {
            this.cache.delete(oldestKey);
            this.logger.debug(`Evicted oldest cache entry: ${oldestKey}`);
        }
    }
    cleanupExpired() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [key, item] of this.cache.entries()) {
            if (item.ttl && now - item.timestamp > item.ttl) {
                this.cache.delete(key);
                cleanedCount++;
            }
        }
        if (cleanedCount > 0) {
            this.logger.debug(`Cleaned up ${cleanedCount} expired cache entries`);
        }
        return cleanedCount;
    }
};
exports.ActionCacheService = ActionCacheService;
exports.ActionCacheService = ActionCacheService = ActionCacheService_1 = __decorate([
    (0, common_1.Injectable)()
], ActionCacheService);
//# sourceMappingURL=action-cache.service.js.map