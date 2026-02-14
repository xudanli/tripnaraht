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
var GooglePoiProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GooglePoiProvider = void 0;
const common_1 = require("@nestjs/common");
let GooglePoiProvider = GooglePoiProvider_1 = class GooglePoiProvider {
    constructor() {
        this.logger = new common_1.Logger(GooglePoiProvider_1.name);
        this.apiKey = process.env.GOOGLE_PLACES_API_KEY;
        this.enabled = !!this.apiKey;
        if (!this.enabled) {
            this.logger.warn('GooglePoiProvider: GOOGLE_PLACES_API_KEY not set, provider disabled');
        }
    }
    async textSearch(args) {
        if (!this.enabled) {
            throw new Error('GooglePoiProvider is not enabled (missing API key)');
        }
        try {
            const { query, lat, lng, radiusM = 1000, language = 'zh-CN' } = args;
            const response = await fetch(`https://maps.googleapis.com/maps/api/place/textsearch/json?` +
                `query=${encodeURIComponent(query)}` +
                `&location=${lat},${lng}` +
                `&radius=${radiusM}` +
                `&language=${language}` +
                `&key=${this.apiKey}`, {
                method: 'GET',
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Google Places API error: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Places API returned status: ${data.status}`);
            }
            if (!data.results || data.results.length === 0) {
                return [];
            }
            return data.results.map((place) => {
                var _a, _b;
                const placeLocation = (_a = place.geometry) === null || _a === void 0 ? void 0 : _a.location;
                const distanceM = placeLocation
                    ? this.calculateDistance(lat, lng, placeLocation.lat, placeLocation.lng)
                    : undefined;
                return {
                    id: place.place_id,
                    name: place.name,
                    nameCN: place.name,
                    nameEN: place.name,
                    lat: (placeLocation === null || placeLocation === void 0 ? void 0 : placeLocation.lat) || lat,
                    lng: (placeLocation === null || placeLocation === void 0 ? void 0 : placeLocation.lng) || lng,
                    distanceM,
                    rating: place.rating,
                    isOpenNow: (_b = place.opening_hours) === null || _b === void 0 ? void 0 : _b.open_now,
                    address: place.formatted_address,
                    tags: place.types || [],
                    matchScore: this.calculateMatchScore(query, place.name, place.formatted_address),
                };
            });
        }
        catch (error) {
            this.logger.error(`Google POI search error: ${error.message}`, error.stack);
            throw error;
        }
    }
    async nearbySearch(args) {
        if (!this.enabled) {
            throw new Error('GooglePoiProvider is not enabled (missing API key)');
        }
        try {
            const { lat, lng, radiusM = 1000, type, keyword, language = 'zh-CN' } = args;
            let url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?` +
                `location=${lat},${lng}` +
                `&radius=${radiusM}` +
                `&language=${language}` +
                `&key=${this.apiKey}`;
            if (type) {
                url += `&type=${type}`;
            }
            if (keyword) {
                url += `&keyword=${encodeURIComponent(keyword)}`;
            }
            const response = await fetch(url, {
                method: 'GET',
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Google Places API error: ${response.status} ${errorText}`);
            }
            const data = await response.json();
            if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                throw new Error(`Google Places API returned status: ${data.status}`);
            }
            if (!data.results || data.results.length === 0) {
                return [];
            }
            return data.results.map((place) => {
                var _a, _b;
                const placeLocation = (_a = place.geometry) === null || _a === void 0 ? void 0 : _a.location;
                const distanceM = placeLocation
                    ? this.calculateDistance(lat, lng, placeLocation.lat, placeLocation.lng)
                    : undefined;
                return {
                    id: place.place_id,
                    name: place.name,
                    nameCN: place.name,
                    nameEN: place.name,
                    lat: (placeLocation === null || placeLocation === void 0 ? void 0 : placeLocation.lat) || lat,
                    lng: (placeLocation === null || placeLocation === void 0 ? void 0 : placeLocation.lng) || lng,
                    distanceM,
                    rating: place.rating,
                    isOpenNow: (_b = place.opening_hours) === null || _b === void 0 ? void 0 : _b.open_now,
                    address: place.vicinity || place.formatted_address,
                    tags: place.types || [],
                    matchScore: keyword ? this.calculateMatchScore(keyword, place.name) : 0.5,
                };
            });
        }
        catch (error) {
            this.logger.error(`Google POI nearby search error: ${error.message}`, error.stack);
            throw error;
        }
    }
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371000;
        const dLat = this.toRad(lat2 - lat1);
        const dLng = this.toRad(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRad(lat1)) *
                Math.cos(this.toRad(lat2)) *
                Math.sin(dLng / 2) *
                Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    toRad(degrees) {
        return degrees * (Math.PI / 180);
    }
    calculateMatchScore(query, name, address) {
        const queryLower = query.toLowerCase();
        const nameLower = name.toLowerCase();
        const addressLower = (address === null || address === void 0 ? void 0 : address.toLowerCase()) || '';
        if (nameLower === queryLower) {
            return 1.0;
        }
        if (nameLower.includes(queryLower) || queryLower.includes(nameLower)) {
            return 0.8;
        }
        if (addressLower.includes(queryLower)) {
            return 0.6;
        }
        const queryWords = queryLower.split(/\s+/);
        const nameWords = nameLower.split(/\s+/);
        const matchingWords = queryWords.filter((qw) => nameWords.some((nw) => nw.includes(qw) || qw.includes(nw)));
        if (matchingWords.length > 0) {
            return 0.4 * (matchingWords.length / queryWords.length);
        }
        return 0.2;
    }
};
exports.GooglePoiProvider = GooglePoiProvider;
exports.GooglePoiProvider = GooglePoiProvider = GooglePoiProvider_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], GooglePoiProvider);
//# sourceMappingURL=google-poi.provider.js.map