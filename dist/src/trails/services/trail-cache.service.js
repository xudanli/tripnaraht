"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrailCacheService = void 0;
const common_1 = require("@nestjs/common");
let TrailCacheService = class TrailCacheService {
    constructor() {
        this.trailCache = new Map();
        this.placesAlongCache = new Map();
        this.recommendationCache = new Map();
        this.DEFAULT_TTL = 5 * 60 * 1000;
    }
    getTrail(trailId) {
        const cached = this.trailCache.get(trailId);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        this.trailCache.delete(trailId);
        return null;
    }
    setTrail(trailId, data, ttl = this.DEFAULT_TTL) {
        this.trailCache.set(trailId, {
            data,
            expiresAt: Date.now() + ttl,
        });
    }
    getPlacesAlong(trailId, radiusKm) {
        const key = `${trailId}-${radiusKm}`;
        const cached = this.placesAlongCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        this.placesAlongCache.delete(key);
        return null;
    }
    setPlacesAlong(trailId, radiusKm, data, ttl = 10 * 60 * 1000) {
        const key = `${trailId}-${radiusKm}`;
        this.placesAlongCache.set(key, {
            data,
            expiresAt: Date.now() + ttl,
        });
    }
    getRecommendation(placeIds, options) {
        const key = this.getRecommendationKey(placeIds, options);
        const cached = this.recommendationCache.get(key);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.data;
        }
        this.recommendationCache.delete(key);
        return null;
    }
    setRecommendation(placeIds, options, data, ttl = 15 * 60 * 1000) {
        const key = this.getRecommendationKey(placeIds, options);
        this.recommendationCache.set(key, {
            data,
            expiresAt: Date.now() + ttl,
        });
    }
    clearAll() {
        this.trailCache.clear();
        this.placesAlongCache.clear();
        this.recommendationCache.clear();
    }
    clearTrail(trailId) {
        this.trailCache.delete(trailId);
        for (const key of this.placesAlongCache.keys()) {
            if (key.startsWith(`${trailId}-`)) {
                this.placesAlongCache.delete(key);
            }
        }
    }
    getRecommendationKey(placeIds, options) {
        const sortedIds = [...placeIds].sort((a, b) => a - b).join(',');
        const optionsStr = JSON.stringify(options || {});
        return `${sortedIds}-${optionsStr}`;
    }
    cleanup() {
        const now = Date.now();
        for (const [key, value] of this.trailCache.entries()) {
            if (value.expiresAt <= now) {
                this.trailCache.delete(key);
            }
        }
        for (const [key, value] of this.placesAlongCache.entries()) {
            if (value.expiresAt <= now) {
                this.placesAlongCache.delete(key);
            }
        }
        for (const [key, value] of this.recommendationCache.entries()) {
            if (value.expiresAt <= now) {
                this.recommendationCache.delete(key);
            }
        }
    }
};
exports.TrailCacheService = TrailCacheService;
exports.TrailCacheService = TrailCacheService = __decorate([
    (0, common_1.Injectable)()
], TrailCacheService);
//# sourceMappingURL=trail-cache.service.js.map